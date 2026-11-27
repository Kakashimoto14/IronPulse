'use strict';
/*
 * IronPulse v3 — automated biomechanics & collision QA for every 3D exercise clip.
 *
 * For each of the 41 exercises x {male, female} x 48 frames per rep this script:
 *   1. runs the real IK solver used by the app (assets/www/js/engine/kinematics-3d.js),
 *   2. CPU-skins the shipped glTF avatar mesh with the same matrices the GPU uses,
 *   3. verifies hard constraints (grip lock, bone lengths, planted feet, no floor / bench / plate
 *      penetration, flush support contact) and movement-specific coaching rules (forearm verticality,
 *      elbow tuck, depth, bar over midfoot, pinned upper arms, plank line, anchored AW elbow, ...).
 * Exit code 1 on any failure. Usage: node scripts/biomech-check.js [--verbose] [--only=<exerciseId>]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = undefined;
require(path.join(ROOT, 'assets/www/js/data/avatar-male.js'));
require(path.join(ROOT, 'assets/www/js/data/avatar-female.js'));
const GLTF = require(path.join(ROOT, 'assets/www/js/engine/gltf-loader.js'));
const K = require(path.join(ROOT, 'assets/www/js/engine/kinematics-3d.js'));
const Data = require(path.join(ROOT, 'assets/www/js/data/exercises.js'));
const M = K.math;

const VERBOSE = process.argv.includes('--verbose');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const FRAMES = 48;
const TOL = {
  grip: 0.006, bone: 0.0015, floor: 0.008, plantedSkate: 0.006, supportPen: 0.016, limbSupportPen: 0.012,
  solidPen: 0.012, flushGap: 0.014
};

function deg(a, b) { return M.angDeg(a, b); }
function mid(a, b) { return M.lerp3(a, b, 0.5); }

function penetration(pr, p) {
  if (pr.t === 'box') {
    const R = pr.R || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const q = M.sub(p, pr.c);
    // columns of R are the box axes
    const l = [R[0] * q[0] + R[3] * q[1] + R[6] * q[2], R[1] * q[0] + R[4] * q[1] + R[7] * q[2], R[2] * q[0] + R[5] * q[1] + R[8] * q[2]];
    const h = [pr.s[0] / 2, pr.s[1] / 2, pr.s[2] / 2];
    if (Math.abs(l[0]) >= h[0] || Math.abs(l[1]) >= h[1] || Math.abs(l[2]) >= h[2]) return 0;
    return Math.min(h[0] - Math.abs(l[0]), h[1] - Math.abs(l[1]), h[2] - Math.abs(l[2]));
  }
  if (pr.t === 'cyl') {
    const ab = M.sub(pr.b, pr.a), L = M.len(ab), u = M.scl(ab, 1 / L), ap = M.sub(p, pr.a), t = M.dot(ap, u);
    if (t <= 0 || t >= L) return 0;
    const rad = M.len(M.sub(ap, M.scl(u, t)));
    if (rad >= pr.r) return 0;
    return Math.min(pr.r - rad, t, L - t);
  }
  if (pr.t === 'sph') { const d = M.len(M.sub(p, pr.c)); return d < pr.r ? pr.r - d : 0; }
  return 0;
}

function penetrationXY(pr, p) {
  // is p within the support's footprint (ignoring the thickness axis)?
  if (pr.t !== 'box') return false;
  const R = pr.R || [1, 0, 0, 0, 1, 0, 0, 0, 1], q = M.sub(p, pr.c);
  const l0 = R[0] * q[0] + R[3] * q[1] + R[6] * q[2], l2 = R[2] * q[0] + R[5] * q[1] + R[8] * q[2];
  return Math.abs(l0) < pr.s[0] / 2 && Math.abs(l2) < pr.s[2] / 2;
}
function topOfSupport(pr) {
  if (pr.t !== 'box') return null;
  const R = pr.R || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const n = [R[1], R[4], R[7]];
  return { n: n, d: M.dot(n, pr.c) + pr.s[1] / 2 };
}

function runExercise(rig, ex, sexLabel) {
  const fails = [];
  const I = rig.I;
  const handBones = new Set(['hand_l', 'hand_r', 'fingers_l', 'fingers_r', 'fingertips_l', 'fingertips_r'].map(n => I[n]));
  const torsoBones = new Set(['pelvis', 'spine', 'chest'].map(n => I[n]));
  const limbBones = new Set(['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'upperarm_l', 'upperarm_r'].map(n => I[n]));
  const all = [];
  for (let v = 0; v < rig.av.nVerts; v += 3) all.push(v);
  const footVerts = { l: K.groupVerts(rig, ['foot_l'], 1), r: K.groupVerts(rig, ['foot_r'], 1) };
  const ankleTrack = { l: [], r: [] }, upperArm = { l: [], r: [] }, elbowTrack = { l: [], r: [] };
  const heelY = [];
  const stats = { maxGrip: 0, maxBone: 0, minFloor: 1, maxSupportPen: 0, maxSolidPen: 0, frames: FRAMES };
  let atPeak = null, maxP = -1;
  for (let f = 0; f < FRAMES; f++) {
    const u = f / FRAMES;
    const ev = K.evaluate(rig, ex, u);
    const P = ev.pose.pts, err = ev.pose.err, c = ev.contacts || {}, chk = ev.checks || {};
    for (let i = 0; i < ev.skin.length; i++) if (!isFinite(ev.skin[i])) { fails.push(`u=${u.toFixed(2)} non-finite skin matrix`); break; }
    // 1. grip lock & reach
    Object.keys(err).forEach(k => {
      if (/^(grip|arm|leg|foot)_/.test(k)) {
        stats.maxGrip = Math.max(stats.maxGrip, err[k]);
        if (err[k] > TOL.grip) fails.push(`u=${u.toFixed(2)} ${k} constraint error ${(err[k] * 1000).toFixed(1)} mm`);
      }
    });
    // 2. bone lengths (rigid segments)
    ['l', 'r'].forEach(sd => {
      const s = rig.side[sd];
      const e1 = Math.abs(M.len(M.sub(P['E_' + sd], P['S_' + sd])) - s.L1), e2 = Math.abs(M.len(M.sub(P['W_' + sd], P['E_' + sd])) - s.L2);
      const e3 = Math.abs(M.len(M.sub(P['K_' + sd], P['hip_' + sd])) - s.Lt), e4 = Math.abs(M.len(M.sub(P['A_' + sd], P['K_' + sd])) - s.Ls);
      const e = Math.max(e1, e2, e3, e4); stats.maxBone = Math.max(stats.maxBone, e);
      if (e > TOL.bone) fails.push(`u=${u.toFixed(2)} ${sd} bone length drift ${(e * 1000).toFixed(1)} mm`);
    });
    // 3. skinned mesh: floor + props
    const V = K.skinVerts(rig, ev.pose, all);
    let minY = 1, minBone = -1;
    const supports = ev.props.filter(p => p.support), solids = ev.props.filter(p => p.solid && !p.support);
    let supPen = 0, limbPen = 0, solPen = 0, worstSup = '', worstSol = '', flushMin = 1;
    for (let i = 0; i < all.length; i++) {
      const p = [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]];
      const dom = rig.dom[all[i]];
      if (p[1] < minY) { minY = p[1]; minBone = dom; }
      for (const s of supports) { const d = penetration(s, p); if (d > 0) { if (d > (supPen > limbPen ? supPen : limbPen)) worstSup = rig.names[dom]; if (torsoBones.has(dom) || handBones.has(dom) || dom === I.foot_l || dom === I.foot_r || dom === I.calf_l || dom === I.calf_r || dom === I.lowerarm_r || dom === I.lowerarm_l) supPen = Math.max(supPen, d); else limbPen = Math.max(limbPen, d); } }
      if (!handBones.has(dom)) for (const s of solids) { const d = penetration(s, p); if (d > solPen) { solPen = d; worstSol = rig.names[dom] + ' vs ' + s.m; } }
      if (c.flush) for (const s of supports) { const t = topOfSupport(s); if (!t) continue; const h = M.dot(t.n, p) - t.d; if (h > -0.03 && h < flushMin && penetrationXY(s, p)) flushMin = h; }
    }
    stats.minFloor = Math.min(stats.minFloor, minY);
    stats.maxSupportPen = Math.max(stats.maxSupportPen, supPen, limbPen);
    stats.maxSolidPen = Math.max(stats.maxSolidPen, solPen);
    if (minY < -TOL.floor) fails.push(`u=${u.toFixed(2)} ${rig.names[minBone]} penetrates floor by ${(-minY * 1000).toFixed(1)} mm`);
    if (supPen > TOL.supportPen) fails.push(`u=${u.toFixed(2)} body (${worstSup}) sinks ${(supPen * 1000).toFixed(1)} mm into bench/pad`);
    if (limbPen > TOL.limbSupportPen) fails.push(`u=${u.toFixed(2)} limb (${worstSup}) clips ${(limbPen * 1000).toFixed(1)} mm into bench/pad`);
    if (solPen > TOL.solidPen) fails.push(`u=${u.toFixed(2)} equipment clips body (${worstSol}) by ${(solPen * 1000).toFixed(1)} mm`);
    if (c.flush && flushMin > TOL.flushGap) fails.push(`u=${u.toFixed(2)} ${c.flush} not flush with support (gap ${(flushMin * 1000).toFixed(1)} mm)`);
    if (c.toesOn != null || c.feetToes || c.balls) {
      ['l', 'r'].forEach(sd => {
        const tv = K.skinVerts(rig, ev.pose, K.groupVerts(rig, ['toes_' + sd], 2));
        let lo = 1; for (let i = 1; i < tv.length; i += 3) lo = Math.min(lo, tv[i]);
        const gap = lo - (c.toesOn || 0);
        if (gap > 0.012 || gap < -TOL.floor) fails.push(`u=${u.toFixed(2)} ${sd} toes not on support (gap ${(gap * 1000).toFixed(1)} mm)`);
      });
    }
    if (chk.heelTravel) { heelY.push(P.A_l[1]); }
    // 4. planted feet
    (c.feet || []).forEach(sd => {
      const fv = K.skinVerts(rig, ev.pose, footVerts[sd]);
      let lo = 1; for (let i = 1; i < fv.length; i += 3) lo = Math.min(lo, fv[i]);
      const supTop = (c.support && supports.length) ? Math.max(0, ...supports.map(s => { const t = topOfSupport(s); return t && Math.abs(t.n[1]) > 0.99 && Math.abs(lo - t.d) < 0.03 ? t.d : 0; })) : 0;
      const gap = lo - supTop;
      if (!c.dynamic && (gap > 0.012 || gap < -TOL.floor)) fails.push(`u=${u.toFixed(2)} ${sd} foot not planted (sole gap ${(gap * 1000).toFixed(1)} mm)`);
      ankleTrack[sd].push(P['A_' + sd]);
    });
    ['l', 'r'].forEach(sd => { upperArm[sd].push(M.nrm(M.sub(P['E_' + sd], P['S_' + sd]))); elbowTrack[sd].push(P['E_' + sd]); });
    if (ev.p > maxP) { maxP = ev.p; atPeak = ev; }
    // 5. movement-specific rules
    const p = ev.p;
    if (chk.forearmVertical) {
      const fc = chk.forearmVertical;
      if ((fc.minP == null || p >= fc.minP) && (fc.maxP == null || p <= fc.maxP)) {
        (fc.side ? [fc.side] : ['l', 'r']).forEach(sd => {
          const fore = M.sub(P['W_' + sd], P['E_' + sd]), a = Math.min(deg(fore, [0, 1, 0]), deg(fore, [0, -1, 0]));
          if (a > fc.maxDeg) fails.push(`u=${u.toFixed(2)} ${sd} forearm ${a.toFixed(1)} deg off vertical (max ${fc.maxDeg})`);
        });
      }
    }
    if (chk.barOverMidfoot || chk.loadOverMidfoot) {
      const tol = (chk.barOverMidfoot || chk.loadOverMidfoot).tol;
      const bar = mid(P.G_l, P.G_r), mf = mid(P.ball_l, P.ball_r), ank = mid(P.A_l, P.A_r);
      const midfootZ = (mf[2] + ank[2]) / 2 + 0.005;
      const dz = Math.abs(bar[2] - midfootZ);
      if (dz > tol) fails.push(`u=${u.toFixed(2)} load ${(dz * 100).toFixed(1)} cm off midfoot (tol ${(tol * 100).toFixed(0)} cm)`);
    }
    if (chk.plank) {
      const sh = P.S_mid, hp = mid(P.hip_l, P.hip_r), an = mid(P.A_l, P.A_r);
      const a = deg(M.sub(hp, sh), M.sub(an, hp));
      if (a > chk.plank.maxSagDeg) fails.push(`u=${u.toFixed(2)} plank line broken ${a.toFixed(1)} deg (hip sag/pike)`);
    }
    if (chk.straightArms) ['l', 'r'].forEach(sd => { const fl = 180 - deg(M.sub(P['S_' + sd], P['E_' + sd]), M.sub(P['W_' + sd], P['E_' + sd])); if (fl > chk.straightArms.maxElbowFlex) fails.push(`u=${u.toFixed(2)} ${sd} elbow bent ${fl.toFixed(0)} deg (arms must stay straight)`); });
    if (chk.hinge && chk.hinge.maxKneeFlex) ['l', 'r'].forEach(sd => { const fl = 180 - deg(M.sub(P['hip_' + sd], P['K_' + sd]), M.sub(P['A_' + sd], P['K_' + sd])); if (fl > chk.hinge.maxKneeFlex) fails.push(`u=${u.toFixed(2)} ${sd} knee flex ${fl.toFixed(0)} deg (RDL must hinge, not squat)`); });
    if (chk.guardPinned && chk.guardPinned.side) {
      const sd = chk.guardPinned.side, head = ev.pose.P[I.head];
      const d = M.len(M.sub(P['W_' + sd], head));
      if (d > 0.2) fails.push(`u=${u.toFixed(2)} guard hand left the face (${(d * 100).toFixed(0)} cm)`);
    }
    if (c.freeFootClear) {
      const fv = K.skinVerts(rig, ev.pose, footVerts[c.freeFootClear]);
      let lo = 1; for (let i = 1; i < fv.length; i += 3) lo = Math.min(lo, fv[i]);
      if (lo < 0.01) fails.push(`u=${u.toFixed(2)} free foot touches the floor`);
    }
    if (chk.torsoHinge) {
      const up = K.math.mV(ev.pose.R[I.chest], [0, 1, 0]), a = deg(up, [0, 1, 0]);
      if (a < chk.torsoHinge.min - 2 || a > chk.torsoHinge.max + 2) fails.push(`u=${u.toFixed(2)} torso hinge ${a.toFixed(0)} deg (expected ${chk.torsoHinge.min}-${chk.torsoHinge.max})`);
    }
    if (chk.elbowAnchored) { /* evaluated across frames below */ }
  }
  // cross-frame rules
  const ev0 = K.evaluate(rig, ex, 0);
  const c0 = ev0.contacts || {}, chk0 = ev0.checks || {};
  (c0.feet || []).forEach(sd => {
    if (c0.dynamic) return;
    const a = ankleTrack[sd]; if (!a.length) return;
    let m = 0; a.forEach(x => { m = Math.max(m, M.len(M.sub(x, a[0]))); });
    if (m > TOL.plantedSkate && !(c0.rearBall === sd)) fails.push(`${sd} planted foot skates ${(m * 1000).toFixed(1)} mm`);
  });
  if (chk0.upperArmPinned) ['l', 'r'].forEach(sd => { let m = 0; upperArm[sd].forEach(v => { m = Math.max(m, deg(v, upperArm[sd][0])); }); if (m > chk0.upperArmPinned.maxDeg) fails.push(`${sd} upper arm drifts ${m.toFixed(1)} deg (must stay pinned)`); });
  if (chk0.elbowAnchored) { const sd = chk0.elbowAnchored.side; let m = 0; elbowTrack[sd].forEach(v => { m = Math.max(m, M.len(M.sub(v, elbowTrack[sd][0]))); }); if (m > chk0.elbowAnchored.tol) fails.push(`${sd} elbow lifts off the pad by ${(m * 1000).toFixed(1)} mm`); }
  if (chk0.heelTravel && heelY.length) { const tr = Math.max(...heelY) - Math.min(...heelY); if (tr < chk0.heelTravel.min) fails.push(`heel travel only ${(tr * 100).toFixed(1)} cm (full ROM calf raise)`); }
  // peak-frame rules
  const P = atPeak.pose.pts, chk = atPeak.checks || {};
  if (chk.elbowTuck) {
    const R = atPeak.pose.R[I.chest], axis = M.mV(R, [0, 1, 0]), front = M.mV(R, [0, 0, 1]);
    ['l', 'r'].forEach(sd => {
      let u = M.sub(P['E_' + sd], P['S_' + sd]);
      u = M.sub(u, M.scl(front, M.dot(u, front)));
      const a = deg(u, M.scl(axis, -1));
      if (a < chk.elbowTuck.min || a > chk.elbowTuck.max) fails.push(`peak ${sd} elbow angle to torso ${a.toFixed(0)} deg (expected ${chk.elbowTuck.min}-${chk.elbowTuck.max}, never flared 90)`);
      stats['elbowTuck_' + sd] = a.toFixed(0);
    });
  }
  if (chk.depth) {
    const sd = chk.depth.side || 'l', d = P['hip_' + sd][1] - P['K_' + sd][1];
    stats.depth = (d * 100).toFixed(1) + 'cm';
    if (d > -chk.depth.hipBelowKnee + 0.001) fails.push(`peak hip crease ${(d * 100).toFixed(1)} cm above knee (must break parallel)`);
  }
  if (chk.kneesOverToes) ['l', 'r'].forEach(sd => {
    const kn = M.sub(P['K_' + sd], P['A_' + sd]); kn[1] = 0; const toe = M.sub(P['ball_' + sd], P['A_' + sd]); toe[1] = 0;
    const a = deg(kn, toe); if (a > 22) fails.push(`peak ${sd} knee caves ${a.toFixed(0)} deg off the toe line`);
  });
  if (chk.externalRotation) ['l', 'r'].forEach(sd => {
    if (!(P['W_' + sd][2] < P['E_' + sd][2] + 0.005 && P['W_' + sd][1] > P['E_' + sd][1])) fails.push(`peak ${sd} face pull lacks external rotation (wrist not behind/above elbow)`);
  });
  if (chk.raiseHeight) ['l', 'r'].forEach(sd => {
    const dy = P['W_' + sd][1] - P['S_' + sd][1];
    if (dy > chk.raiseHeight.maxAboveShoulder || dy < -0.08) fails.push(`peak ${sd} lateral raise wrist ${(dy * 100).toFixed(0)} cm vs shoulder (stop at shoulder height)`);
  });
  if (chk.pelvicCurl) {
    const a = deg(M.mV(atPeak.pose.R[I.spine], [0, 1, 0]), M.mV(atPeak.pose.R[I.chest], [0, 1, 0])) + deg(M.mV(atPeak.pose.R[I.pelvis], [0, 1, 0]), M.mV(atPeak.pose.R[I.spine], [0, 1, 0]));
    if (a < chk.pelvicCurl.minSpineFlex) fails.push(`peak pelvic curl only ${a.toFixed(0)} deg (hip-flexor swing)`);
  }
  if (chk.elbowTuck && chk.elbowTuck.rowing) { /* rowing tuck reported via elbowTuck */ }
  return { fails, stats };
}

let total = 0, failed = 0;
const rows = [];
for (const sex of ['male', 'female']) {
  const rig = K.createRig(GLTF.getAvatar(sex));
  for (const ex of Data.EXERCISES) {
    if (ONLY && ex.id !== ONLY) continue;
    total++;
    const r = runExercise(rig, ex, sex);
    const ok = r.fails.length === 0;
    if (!ok) failed++;
    rows.push({ sex, id: ex.id, clip: K.clipFor(ex).id, ok, r });
    const s = r.stats;
    const line = `${ok ? '[PASS]' : '[FAIL]'} ${sex.padEnd(6)} ${ex.id.padEnd(24)} grip<=${(s.maxGrip * 1000).toFixed(1)}mm bone<=${(s.maxBone * 1000).toFixed(2)}mm floor>=${(s.minFloor * 1000).toFixed(1)}mm pad<=${(s.maxSupportPen * 1000).toFixed(1)}mm kit<=${(s.maxSolidPen * 1000).toFixed(1)}mm` + (s.depth ? ` depth=${s.depth}` : '') + (s.elbowTuck_l ? ` tuck=${s.elbowTuck_l}deg` : '');
    if (!ok || VERBOSE) console.log(line);
    if (!ok) { const uniq = [...new Set(r.fails.map(f => f.replace(/^u=[0-9.]+ /, '')))]; uniq.slice(0, 6).forEach(f => console.log('       - ' + f + '  (' + r.fails.filter(x => x.endsWith(f)).length + ' frames)')); }
  }
}
console.log(`Biomechanics QA: ${total - failed}/${total} exercise rigs pass (${FRAMES} frames each, skinned-mesh collision + coaching rules)`);
if (require.main === module && failed) process.exit(1);
module.exports = { rows, total, failed };
