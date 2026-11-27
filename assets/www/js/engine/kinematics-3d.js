/* IronPulse v3 — biomechanical 3D motion engine.
 *
 * Every exercise is authored as WORLD-SPACE constraints (grip points on the bar/handles, planted feet,
 * bench/pad planes, bar paths, joint-angle schedules). An analytic 2-bone IK solver with pole/aim
 * vectors resolves shoulders->elbows->wrists and hips->knees->ankles every frame, so hands stay locked
 * to equipment and feet stay planted by construction. Supports (benches, seats, pads, boxes, tables)
 * are auto-fitted to the *skinned mesh* at setup so backs/glutes rest flush with zero clipping.
 *
 * Coordinates: metres, +Y up, avatar faces +Z, character's LEFT = +X ("_l"), RIGHT = -X ("_r").
 */
(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  var Y = [0, 1, 0], Xv = [1, 0, 0], Zv = [0, 0, 1];

  // ------------------------------------------------------------------ vector math
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function madd(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function nrm(a) { var l = len(a) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function perp(a, axis) { return sub(a, scl(axis, dot(a, axis))); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function angDeg(a, b) { return Math.acos(clamp(dot(nrm(a), nrm(b)), -1, 1)) / DEG; }

  // 3x3 row-major
  function mMul(A, B) {
    var o = new Array(9);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return o;
  }
  function mV(A, v) { return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]]; }
  function mT(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; }
  var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rotAxis(k, ang) {
    k = nrm(k); var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, x = k[0], y = k[1], z = k[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  // Euler (deg): R = Ry * Rx * Rz ; +rx = forward flexion/pitch (up-axis tips toward +Z)
  function euler(e) { if (!e) return I3; return mMul(ry(e[1] * DEG), mMul(rx(e[0] * DEG), rz((e[2] || 0) * DEG))); }
  function frame(d, r) {
    d = nrm(d); r = nrm(perp(r, d)); var c = cross(d, r);
    return [d[0], r[0], c[0], d[1], r[1], c[1], d[2], r[2], c[2]];
  }
  function deltaRot(dP, rP, d0, r0) { return mMul(frame(dP, rP), mT(frame(d0, r0))); }

  // ------------------------------------------------------------------ 2-bone IK
  function ik2(S, T, L1, L2, pole) {
    var d = sub(T, S), D = len(d);
    var maxR = (L1 + L2) * 0.9995, minR = Math.abs(L1 - L2) + 1e-4;
    var Dc = clamp(D, minR, maxR);
    var u = D > 1e-9 ? scl(d, 1 / D) : [0, -1, 0];
    var W = madd(S, u, Dc);
    var a = (L1 * L1 - L2 * L2 + Dc * Dc) / (2 * Dc);
    var h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    var pp = perp(pole, u);
    if (len(pp) < 1e-6) pp = perp(Math.abs(u[1]) < 0.9 ? Y : Zv, u);
    pp = nrm(pp);
    var E = add(madd(S, u, a), scl(pp, h));
    return { E: E, W: W, deficit: Math.max(0, D - Dc), pp: pp, u: u };
  }

  // ------------------------------------------------------------------ rig
  function createRig(av) {
    var names = av.boneNames, nb = names.length, I = {};
    names.forEach(function (n, i) { I[n] = i; });
    var H = names.map(function (n) { return av.head[n]; });
    var T = names.map(function (n) { return av.tail[n]; });
    var meta = av.meta || {};
    var rig = { av: av, nb: nb, names: names, I: I, H: H, T: T, meta: meta, cache: {}, side: {} };
    ['l', 'r'].forEach(function (sd) {
      var s = sd === 'l' ? 1 : -1;
      var sh = H[I['upperarm_' + sd]], el = H[I['lowerarm_' + sd]], wr = H[I['hand_' + sd]], kn = H[I['fingers_' + sd]];
      var u0 = nrm(sub(el, sh)), f0 = nrm(sub(wr, el));
      var hinge0 = meta.elbowHinge ? nrm(meta.elbowHinge[sd]) : nrm(cross(u0, f0));
      var hand0 = nrm(sub(kn, wr));
      var palm0 = nrm(perp(meta.palm ? meta.palm[sd] : [-s, 0, 0], hand0));
      var thumb0 = meta.thumb ? nrm(meta.thumb[sd]) : nrm(cross(hand0, palm0));
      var sgn = dot(palm0, cross(thumb0, hand0)) >= 0 ? 1 : -1;
      var hip = H[I['thigh_' + sd]], knee = H[I['calf_' + sd]], ank = H[I['foot_' + sd]], ball = T[I['foot_' + sd]];
      var t0 = nrm(sub(knee, hip)), s0 = nrm(sub(ank, knee));
      var kh0 = nrm(cross(Zv, t0));
      var hs = len(sub(kn, wr)) / 0.088;
      rig.side[sd] = {
        s: s, L1: len(sub(el, sh)), L2: len(sub(wr, el)), Lt: len(sub(knee, hip)), Ls: len(sub(ank, knee)),
        u0: u0, f0: f0, hinge0: hinge0, hand0: hand0, palm0: palm0, thumb0: thumb0, sgn: sgn,
        t0: t0, s0: s0, kh0: kh0, foot0: nrm(sub(ball, ank)), hs: hs,
        gD: 0.075 * hs, gN: 0.031 * hs,
        toe0: I['toes_' + sd] != null ? nrm(sub(T[I['toes_' + sd]], H[I['toes_' + sd]])) : null,
        thumbDir0: I['thumb_' + sd] != null ? nrm(sub(T[I['thumb_' + sd]], H[I['thumb_' + sd]])) : null
      };
    });
    // vertex groups by dominant bone (for CPU skinning / support fitting / QA)
    var nv = av.nVerts, dom = new Uint8Array(nv), groups = names.map(function () { return []; });
    for (var v = 0; v < nv; v++) {
      var bw = 0, bi = 0;
      for (var k = 0; k < 4; k++) { if (av.weights[v * 4 + k] > bw) { bw = av.weights[v * 4 + k]; bi = av.bones[v * 4 + k]; } }
      dom[v] = bi; groups[bi].push(v);
    }
    rig.dom = dom; rig.groups = groups;
    rig.footList = {};
    ['l', 'r'].forEach(function (sd) { var l = []; ['foot_' + sd, 'toes_' + sd].forEach(function (b) { var g = groups[I[b]] || []; for (var i = 0; i < g.length; i += 3) l.push(g[i]); }); rig.footList[sd] = l; });
    rig.B = metrics(rig);
    return rig;
  }

  function metrics(rig) {
    var H = rig.H, I = rig.I, av = rig.av, L = rig.side.l;
    var B = {
      L1: L.L1, L2: L.L2, reach: L.L1 + L.L2, Lt: L.Lt, Ls: L.Ls, leg: L.Lt + L.Ls,
      gD: L.gD, gN: L.gN,
      pelvis: H[I.pelvis], chest: H[I.chest], neck: H[I.neck], head: H[I.head], top: rig.T[I.head],
      shoulderX: Math.abs(H[I.upperarm_l][0]), shoulderY: H[I.upperarm_l][1],
      hipX: Math.abs(H[I.thigh_l][0]), hipY: H[I.thigh_l][1],
      ankleH: H[I.foot_l][1], ankleZ: H[I.foot_l][2], ballFwd: rig.T[I.foot_l][2] - H[I.foot_l][2], ballH: rig.T[I.foot_l][1],
      height: rig.T[I.head][1], female: (rig.meta.sex === 'female')
    };
    // chest front / back depth from the mesh
    var maxZ = -1, minZ = 1, cg = rig.groups[I.chest];
    for (var i = 0; i < cg.length; i++) {
      var v = cg[i], x = av.pos[v * 3], z = av.pos[v * 3 + 2];
      if (Math.abs(x) < 0.1) { if (z > maxZ) maxZ = z; if (z < minZ) minZ = z; }
    }
    B.chestFrontZ = maxZ; B.backZ = minZ;
    // true sole height: ankle / ball joint heights above the lowest shoe vertex
    var soleMin = 1;
    ['foot_l', 'toes_l'].forEach(function (b) { var g = rig.groups[I[b]] || []; for (var j = 0; j < g.length; j++) soleMin = Math.min(soleMin, av.pos[g[j] * 3 + 1]); });
    B.ankleH = H[I.foot_l][1] - soleMin; B.ballH = rig.T[I.foot_l][1] - soleMin;
    // sole points (foot group) relative to ankle, for foot placement
    B.footPts = {};
    ['l', 'r'].forEach(function (sd) {
      var g = rig.groups[I['foot_' + sd]].concat(rig.groups[I['toes_' + sd]] || []), A = H[I['foot_' + sd]], pts = [];
      for (var j = 0; j < g.length; j += 2) { var q = g[j]; pts.push([av.pos[q * 3] - A[0], av.pos[q * 3 + 1] - A[1], av.pos[q * 3 + 2] - A[2]]); }
      B.footPts[sd] = pts;
    });
    return B;
  }

  // ------------------------------------------------------------------ solver
  function trunkFK(rig, spec) {
    var I = rig.I, H = rig.H, R = {}, P = {};
    var pel = spec.pelvis || {};
    R.pelvis = euler(pel.rot); P.pelvis = (pel.pos || H[I.pelvis]).slice();
    function chain(b, par, rot) {
      R[b] = mMul(R[par], euler(rot));
      P[b] = add(P[par], mV(R[par], sub(H[I[b]], H[I[par]])));
    }
    chain('spine', 'pelvis', spec.spine); chain('chest', 'spine', spec.chest);
    chain('neck', 'chest', spec.neck); chain('head', 'neck', spec.head);
    var clav = spec.clav || {};
    ['l', 'r'].forEach(function (sd) {
      var s = sd === 'l' ? 1 : -1, c = clav[sd] || clav.both || [0, 0];
      var loc = mMul(ry(-s * (c[1] || 0) * DEG), rz(s * (c[0] || 0) * DEG));
      R['clavicle_' + sd] = mMul(R.chest, loc);
      P['clavicle_' + sd] = add(P.chest, mV(R.chest, sub(H[I['clavicle_' + sd]], H[I.chest])));
      P['S_' + sd] = add(P['clavicle_' + sd], mV(R['clavicle_' + sd], sub(H[I['upperarm_' + sd]], H[I['clavicle_' + sd]])));
      P['hip_' + sd] = add(P.pelvis, mV(R.pelvis, sub(H[I['thigh_' + sd]], H[I.pelvis])));
    });
    // optional anchor: translate the whole trunk so a named point lands on a target
    if (spec.anchor) {
      var a = spec.anchor, cur;
      if (a.point === 'shoulders') cur = lerp3(P.S_l, P.S_r, 0.5);
      else if (a.point === 'hips') cur = lerp3(P.hip_l, P.hip_r, 0.5);
      else cur = P[a.point];
      var dlt = sub(a.pos, cur);
      Object.keys(P).forEach(function (k) { P[k] = add(P[k], dlt); });
    }
    return { R: R, P: P };
  }

  function bonePoint(rig, fk, bone, restPt) {
    return add(fk.P[bone], mV(fk.R[bone], sub(restPt, rig.H[rig.I[bone]])));
  }

  function handFrame(sd, rig, a) {
    var sdat = rig.side[sd], d, n;
    if (a.n) { d = nrm(a.d); n = nrm(perp(a.n, d)); }
    else { d = nrm(a.d); var t = nrm(perp(a.t, d)); n = scl(cross(t, d), sdat.sgn); }
    return { d: d, n: n };
  }

  function solve(rig, spec) {
    var I = rig.I, H = rig.H, nb = rig.nb;
    var fk = trunkFK(rig, spec);
    var R = new Array(nb), P = new Array(nb), pts = {}, err = {};
    ['pelvis', 'spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r'].forEach(function (b) { R[I[b]] = fk.R[b]; P[I[b]] = fk.P[b]; });
    var arms = spec.arms || {}, legs = spec.legs || {};
    ['l', 'r'].forEach(function (sd) {
      var sdat = rig.side[sd], s = sdat.s, a = arms[sd] || { mode: 'fk', u: [s * 0.35, -1, 0.04], flexDir: Zv, flex: 12, sup: 0 };
      var S = fk.P['S_' + sd], E, W, u, f, hinge, d, n;
      if (a.mode === 'fk') {
        if (a.elbowAt) { E = a.elbowAt.slice(); u = nrm(sub(E, S)); err['arm_' + sd] = Math.abs(len(sub(E, S)) - sdat.L1); }
        else { u = nrm(a.u); E = madd(S, u, sdat.L1); }
        if (a.fore) { f = nrm(a.fore); }
        else {
          var fd = nrm(perp(a.flexDir || Zv, u)), ph = (a.flex || 0) * DEG;
          f = add(scl(u, Math.cos(ph)), scl(fd, Math.sin(ph)));
        }
        W = madd(E, f, sdat.L2);
        var cr = cross(u, f);
        hinge = len(cr) > 1e-4 ? nrm(cr) : nrm(cross(u, a.flexDir ? nrm(perp(a.flexDir, u)) : Zv));
      } else {
        var hf = handFrame(sd, rig, a);
        d = hf.d; n = hf.n;
        var Wt = a.mode === 'wrist' ? a.W : sub(sub(a.G, scl(d, a.gD != null ? a.gD : sdat.gD)), scl(n, a.gN != null ? a.gN : sdat.gN));
        var pole = a.aim ? sub(a.aim, S) : (a.pole || [s * 0.3, -0.4, -1]);
        var sol = ik2(S, Wt, sdat.L1, sdat.L2, pole);
        E = sol.E; W = sol.W; err['arm_' + sd] = sol.deficit;
        u = nrm(sub(E, S)); f = nrm(sub(W, E));
        var c2 = cross(u, f);
        hinge = len(c2) > 1e-3 ? nrm(c2) : nrm(cross(sol.pp, u));
      }
      var Ru = deltaRot(u, hinge, sdat.u0, sdat.hinge0);
      var Rf = deltaRot(f, hinge, sdat.f0, sdat.hinge0);
      if (!d && a.mode === 'fk' && (a.n || a.t) && a.d) { var hf2 = handFrame(sd, rig, a); d = hf2.d; n = hf2.n; }
      if (!d) {
        // forearm-relative hand: neutral -> supination -> wrist flexion -> deviation
        d = mV(Rf, sdat.hand0); n = mV(Rf, sdat.palm0);
        var sup = (a.sup || 0) * DEG * -s;
        if (sup) { var Rs = rotAxis(f, sup); d = mV(Rs, d); n = mV(Rs, n); }
        if (a.wflex) { var wf = a.wflex * DEG, d2 = add(scl(d, Math.cos(wf)), scl(n, Math.sin(wf))); n = add(scl(n, Math.cos(wf)), scl(d, -Math.sin(wf))); d = d2; }
        if (a.dev) { var tt = scl(cross(d, n), sdat.sgn), dv = a.dev * DEG, d3 = add(scl(d, Math.cos(dv)), scl(tt, Math.sin(dv))); d = nrm(d3); n = nrm(perp(n, d)); }
      }
      var Rh = deltaRot(d, n, sdat.hand0, sdat.palm0);
      var curl = a.curl != null ? a.curl : 0.25;
      var kx = nrm(cross(d, n));
      var R1 = mMul(rotAxis(kx, curl * 78 * DEG), Rh), R2 = mMul(rotAxis(kx, curl * (78 + 84) * DEG), Rh);
      var iU = I['upperarm_' + sd], iF = I['lowerarm_' + sd], iH = I['hand_' + sd], i1 = I['fingers_' + sd], i2 = I['fingertips_' + sd];
      R[iU] = Ru; P[iU] = S; R[iF] = Rf; P[iF] = E; R[iH] = Rh; P[iH] = W;
      R[i1] = R1; P[i1] = add(W, mV(Rh, sub(H[i1], H[iH])));
      R[i2] = R2; P[i2] = add(P[i1], mV(R1, sub(H[i2], H[i1])));
      var iTh = I['thumb_' + sd];
      if (iTh != null) {
        var tdp = mV(Rh, sdat.thumbDir0), tgt = null, Rth = Rh;
        if (curl < 0) tgt = nrm(perp(tdp, n));                       // flat palm: thumb lies in the palm plane
        else if (curl > 0.55) tgt = nrm(add(tdp, scl(n, 0.32 * curl))); // power grip: thumb wraps the handle
        if (tgt) { var axT = cross(tdp, tgt); if (len(axT) > 1e-6) Rth = mMul(rotAxis(axT, Math.acos(clamp(dot(tdp, tgt), -1, 1))), Rh); }
        R[iTh] = Rth; P[iTh] = add(W, mV(Rh, sub(H[iTh], H[iH])));
      }
      var G = add(add(W, scl(d, a.gD != null ? a.gD : sdat.gD)), scl(n, a.gN != null ? a.gN : sdat.gN));
      pts['S_' + sd] = S; pts['E_' + sd] = E; pts['W_' + sd] = W; pts['G_' + sd] = G;
      pts['d_' + sd] = d; pts['n_' + sd] = n; pts['t_' + sd] = scl(cross(d, n), sdat.sgn);
      if (a.G) err['grip_' + sd] = len(sub(G, a.G));

      // ---------------- legs
      var lg = legs[sd] || {};
      var hip = fk.P['hip_' + sd], K, A, td, sd2, kh, toe, up;
      if (lg.mode === 'fk') {
        td = nrm(lg.u); K = madd(hip, td, sdat.Lt);
        var kfd = nrm(perp(lg.flexDir || scl(Zv, -1), td)), kp = (lg.flex || 0) * DEG;
        sd2 = add(scl(td, Math.cos(kp)), scl(kfd, Math.sin(kp)));
        A = madd(K, sd2, sdat.Ls);
        var c3 = cross(td, sd2);
        kh = len(c3) > 1e-4 ? nrm(c3) : nrm(cross(scl(kfd, -1), td));
      } else {
        var At = lg.ankle || add(hip, [0, -sdat.Lt - sdat.Ls + 0.02, 0]);
        var kpole = lg.aim ? sub(lg.aim, hip) : (lg.pole || [s * 0.1, 0, 1]);
        var ls = ik2(hip, At, sdat.Lt, sdat.Ls, kpole);
        K = ls.E; A = ls.W; err['leg_' + sd] = ls.deficit;
        td = nrm(sub(K, hip)); sd2 = nrm(sub(A, K));
        var c4 = cross(td, sd2);
        kh = len(c4) > 1e-3 ? nrm(c4) : nrm(cross(ls.pp, td));
      }
      var Rt = deltaRot(td, kh, sdat.t0, sdat.kh0), Rc = deltaRot(sd2, kh, sdat.s0, sdat.kh0);
      var Rfo;
      if (lg.Rfoot) Rfo = lg.Rfoot;
      else if (lg.toe) { toe = nrm(lg.toe); up = nrm(perp(lg.up || Y, toe)); Rfo = deltaRot(toe, up, sdat.foot0, perp(Y, sdat.foot0)); }
      else {
        Rfo = Rc;
        if (lg.plantar) Rfo = mMul(rotAxis(kh, -lg.plantar * DEG), Rc);
      }
      var iT = I['thigh_' + sd], iC = I['calf_' + sd], iFo = I['foot_' + sd];
      R[iT] = Rt; P[iT] = hip; R[iC] = Rc; P[iC] = K; R[iFo] = Rfo; P[iFo] = A;
      pts['hip_' + sd] = hip; pts['K_' + sd] = K; pts['A_' + sd] = A;
      pts['ball_' + sd] = add(A, mV(Rfo, sub(rig.T[iFo], H[iFo])));
      var iTo = I['toes_' + sd];
      if (iTo != null) {
        var Rto = Rfo;
        if (lg.toeFlat) {
          // metatarsophalangeal extension: toes stay flat on the contact surface while the heel rises
          var td0 = mV(Rfo, sdat.toe0), flat = nrm([td0[0], 0, td0[2]]);
          if (td0[1] < flat[1] - 1e-4) { var ax = cross(td0, flat); if (len(ax) > 1e-6) Rto = mMul(rotAxis(ax, Math.acos(clamp(dot(td0, flat), -1, 1))), Rfo); }
        } else if (lg.toeCurl) Rto = mMul(rotAxis(kh, lg.toeCurl * DEG), Rfo);
        R[iTo] = Rto; P[iTo] = pts['ball_' + sd];
      }
      if (lg.ankle) err['foot_' + sd] = len(sub(A, lg.ankle));
    });
    pts.S_mid = lerp3(pts.S_l, pts.S_r, 0.5);
    pts.headTop = add(P[I.head], mV(R[I.head], sub(rig.T[I.head], H[I.head])));
    // skin matrices (column-major): M = [R | P - R*H]
    var skin = new Float32Array(nb * 16);
    for (var b = 0; b < nb; b++) {
      var Rb = R[b], Pb = P[b], t = sub(Pb, mV(Rb, H[b])), o = b * 16;
      skin[o] = Rb[0]; skin[o + 1] = Rb[3]; skin[o + 2] = Rb[6]; skin[o + 3] = 0;
      skin[o + 4] = Rb[1]; skin[o + 5] = Rb[4]; skin[o + 6] = Rb[7]; skin[o + 7] = 0;
      skin[o + 8] = Rb[2]; skin[o + 9] = Rb[5]; skin[o + 10] = Rb[8]; skin[o + 11] = 0;
      skin[o + 12] = t[0]; skin[o + 13] = t[1]; skin[o + 14] = t[2]; skin[o + 15] = 1;
    }
    return { R: R, P: P, pts: pts, err: err, skin: skin, spec: spec };
  }

  // CPU skinning of a vertex subset (support fitting + QA)
  function skinVerts(rig, pose, list) {
    var av = rig.av, out = new Float32Array(list.length * 3), sk = pose.skin;
    for (var i = 0; i < list.length; i++) {
      var v = list[i], x = av.pos[v * 3], y = av.pos[v * 3 + 1], z = av.pos[v * 3 + 2], ox = 0, oy = 0, oz = 0;
      for (var k = 0; k < 4; k++) {
        var w = av.weights[v * 4 + k]; if (!w) continue;
        var o = av.bones[v * 4 + k] * 16;
        ox += w * (sk[o] * x + sk[o + 4] * y + sk[o + 8] * z + sk[o + 12]);
        oy += w * (sk[o + 1] * x + sk[o + 5] * y + sk[o + 9] * z + sk[o + 13]);
        oz += w * (sk[o + 2] * x + sk[o + 6] * y + sk[o + 10] * z + sk[o + 14]);
      }
      out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz;
    }
    return out;
  }
  function groupVerts(rig, bones, step, filt) {
    var list = [];
    bones.forEach(function (b) {
      var g = rig.groups[rig.I[b]];
      for (var i = 0; i < g.length; i += (step || 1)) {
        var v = g[i];
        if (!filt || filt(rig.av.pos[v * 3], rig.av.pos[v * 3 + 1], rig.av.pos[v * 3 + 2])) list.push(v);
      }
    });
    return list;
  }
  function extremeAlong(rig, pose, list, dir) {
    var P = skinVerts(rig, pose, list), best = -1e9, bp = null;
    for (var i = 0; i < list.length; i++) {
      var q = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], d = dot(q, dir);
      if (d > best) { best = d; bp = q; }
    }
    return { value: best, point: bp };
  }
  function bisect(f, lo, hi, it) {
    var flo = f(lo);
    for (var i = 0; i < (it || 32); i++) {
      var mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // root of f nearest x0 within +-span (falls back to the minimiser of |f|)
  function rootNear(f, x0, span) {
    var N = 40, best = null, bx = x0, bf = 1e9, prevX = x0 - span, prevF = f(prevX);
    for (var i = 1; i <= N; i++) {
      var x = x0 - span + (2 * span * i) / N, fx = f(x);
      if (Math.abs(fx) < bf) { bf = Math.abs(fx); bx = x; }
      if ((fx > 0) !== (prevF > 0)) {
        var r = bisect(f, prevX, x, 30);
        if (best === null || Math.abs(r - x0) < Math.abs(best - x0)) best = r;
      }
      prevX = x; prevF = fx;
    }
    return best !== null ? best : bx;
  }

  // ------------------------------------------------------------------ helpers for clips
  var TORSO = ['pelvis', 'spine', 'chest'];
  function plantedLegs(B, o) {
    o = o || {};
    var legs = {};
    ['l', 'r'].forEach(function (sd) {
      var s = sd === 'l' ? 1 : -1, oo = o[sd] || {};
      var w = oo.w != null ? oo.w : (o.w != null ? o.w : B.hipX + 0.035);
      var z = oo.z != null ? oo.z : (o.z != null ? o.z : B.ankleZ);
      var yaw = (oo.toeOut != null ? oo.toeOut : (o.toeOut != null ? o.toeOut : 9)) * DEG;
      var hd = oo.yaw != null ? oo.yaw * DEG : s * yaw;
      var toe = [Math.sin(hd), 0, Math.cos(hd)];
      var Rfoot = ry(hd - s * 4.5 * DEG);
      var fy = oo.floor != null ? oo.floor : (o.floor || 0);
      legs[sd] = { ankle: [s * w + (oo.dx || 0), B.ankleH + fy, z], Rfoot: Rfoot, heading: toe, pole: nrm(add(toe, [s * (o.kneeOut != null ? o.kneeOut : 0.18), 0.05, 0])) };
    });
    return legs;
  }
  function midfoot(legs, sd) { var a = legs[sd].ankle, h = legs[sd].heading || legs[sd].toe, t = nrm([h[0], 0, h[2]]); return [a[0] + t[0] * 0.07, 0, a[2] + t[2] * 0.07]; }
  // ball-of-foot contact (heel raised, toes flat): ball joint on the support, foot rotated by Rm
  function ballFoot(rig, B, sd, Rm, supportY, x, z) {
    var I = rig.I, rb = sub(rig.T[I['foot_' + sd]], rig.H[I['foot_' + sd]]);
    var ball = [x, supportY + B.ballH, z];
    return { ankle: sub(ball, mV(Rm, rb)), Rfoot: Rm, toeFlat: true, heading: mV(Rm, [0, 0, 1]) };
  }
  // lowest skinned vertex (along -n) among vertices whose world position satisfies 'inside'
  function lowestOver(rig, spec, n, inside, step) {
    var pose = solve(rig, spec), list = [];
    for (var v = 0; v < rig.av.nVerts; v += (step || 2)) list.push(v);
    var P = skinVerts(rig, pose, list), best = 1e9;
    for (var i = 0; i < list.length; i++) {
      var q = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      if (!inside(q)) continue;
      var d = dot(q, n); if (d < best) best = d;
    }
    return best;
  }
  // foot placement: rotate the rest foot by Rm, translate so the lowest sole point sits on floorY and anchor (x,z)
  function placeFoot(B, sd, Rm, floorY, ax, az, anchorFwd) {
    var pts = B.footPts[sd], minY = 1e9, lowest = null;
    for (var i = 0; i < pts.length; i++) { var q = mV(Rm, pts[i]); if (q[1] < minY) { minY = q[1]; lowest = q; } }
    var ank = [ax, floorY - minY + 0.0015, az];
    if (anchorFwd === 'lowest') { ank[0] = ax - lowest[0]; ank[2] = az - lowest[2]; }
    return { ankle: ank, toe: mV(Rm, [0, -0.45, 1]), up: mV(Rm, Y) };
  }
  function legReachPelvisY(rig, spec, frac, lo, hi) {
    return bisect(function (y) {
      spec.pelvis.pos[1] = y;
      var fk = trunkFK(rig, spec), m = 0;
      ['l', 'r'].forEach(function (sd) {
        var r = len(sub(spec.legs[sd].ankle, fk.P['hip_' + sd])) / (rig.side[sd].Lt + rig.side[sd].Ls);
        if (r > m) m = r;
      });
      return m - frac;
    }, lo || 0.3, hi || 1.3);
  }
  function grip(G, d, t, o) {
    var a = { mode: 'grip', G: G, d: d, curl: 1 };
    if (t) a.t = t;
    if (o) for (var k in o) a[k] = o[k];
    return a;
  }

  // ------------------------------------------------------------------ equipment props
  function box(c, s, m, o) { var p = { t: 'box', c: c, s: s, m: m || 'frame' }; if (o) for (var k in o) p[k] = o[k]; return p; }
  function cyl(a, b, r, m, o) { var p = { t: 'cyl', a: a, b: b, r: r, m: m || 'chrome' }; if (o) for (var k in o) p[k] = o[k]; return p; }
  function rotBox(c, s, Rm, m, o) { var p = box(c, s, m, o); p.R = Rm; return p; }

  function barbellProps(center, axis, plates, opt) {
    opt = opt || {};
    axis = nrm(axis);
    var half = opt.half || 1.1, r = opt.r || 0.0145, out = [];
    out.push(cyl(madd(center, axis, -half), madd(center, axis, half), r, 'chrome', { seg: 14 }));
    [-1, 1].forEach(function (s) {
      var sl0 = 0.65, sl1 = half;
      out.push(cyl(madd(center, axis, s * sl0), madd(center, axis, s * sl1), 0.025, 'chrome', { seg: 14 }));
      out.push(cyl(madd(center, axis, s * (sl0 - 0.012)), madd(center, axis, s * (sl0 + 0.012)), 0.04, 'chrome', { seg: 14 }));
      var x = sl0 + 0.02;
      (plates || [[0.225, 0.045]]).forEach(function (pl) {
        out.push(cyl(madd(center, axis, s * x), madd(center, axis, s * (x + pl[1])), pl[0], pl[2] || 'plate', { seg: 28, solid: true }));
        x += pl[1] + 0.004;
      });
      out.push(cyl(madd(center, axis, s * x), madd(center, axis, s * (x + 0.03)), 0.04, 'accent', { seg: 14 }));
    });
    return out;
  }
  function dumbbellProps(G, axis, size) {
    axis = nrm(axis); size = size || 1;
    var hh = 0.068, out = [cyl(madd(G, axis, -hh - 0.012), madd(G, axis, hh + 0.012), 0.0165, 'chrome', { seg: 12 })];
    [-1, 1].forEach(function (s) {
      out.push(cyl(madd(G, axis, s * hh), madd(G, axis, s * (hh + 0.016)), 0.05 * size, 'chrome', { seg: 6 }));
      out.push(cyl(madd(G, axis, s * (hh + 0.016)), madd(G, axis, s * (hh + 0.016 + 0.05 * size)), 0.062 * size, 'plate', { seg: 6, solid: true }));
    });
    return out;
  }
  function flatBench(z0, z1, top, o) {
    o = o || {};
    var x = o.x || 0, w = o.w || 0.29, th = 0.065, zc = (z0 + z1) / 2, L = Math.abs(z1 - z0), out = [];
    out.push(box([x, top - th / 2, zc], [w, th, L], 'pad', { solid: true, support: true }));
    out.push(box([x, top - th - 0.02, zc], [0.1, 0.04, L * 0.92], 'frame'));
    [z0 + 0.1 * Math.sign(z1 - z0), z1 - 0.1 * Math.sign(z1 - z0)].forEach(function (zz) {
      out.push(box([x, (top - th) / 2, zz], [0.06, top - th - 0.02, 0.06], 'frame'));
      out.push(box([x, 0.02, zz], [0.44, 0.04, 0.08], 'frame'));
    });
    return out;
  }
  function inclinePad(anchor, angleDeg, length, w, mat) {
    // anchor = lower edge centre of the pad's top surface; the pad rises toward -Z
    var a = angleDeg * DEG, dir = [0, Math.sin(a), -Math.cos(a)], nv = [0, Math.cos(a), Math.sin(a)];
    var c = madd(madd(anchor, dir, length / 2), nv, -0.0325);
    return rotBox(c, [w || 0.29, 0.065, length], [1, 0, 0, 0, nv[1], dir[1], 0, nv[2], dir[2]], mat || 'pad', { solid: true, support: true });
  }
  function cableTower(base, pulleyY, faceDir) {
    var out = [box([base[0], 1.05, base[2]], [0.16, 2.1, 0.16], 'frame')];
    out.push(box([base[0], 0.03, base[2]], [0.5, 0.06, 0.5], 'frame'));
    out.push(cyl([base[0], pulleyY - 0.04, base[2]], [base[0], pulleyY + 0.04, base[2]], 0.045, 'accent', { seg: 16 }));
    return out;
  }
  function cableLine(from, to) { return cyl(from, to, 0.0045, 'cable', { seg: 6 }); }
  function ropeHandle(G_l, G_r, anchor) {
    var mid = madd(lerp3(G_l, G_r, 0.5), nrm(sub(anchor, lerp3(G_l, G_r, 0.5))), 0.06);
    return [cyl(mid, G_l, 0.011, 'rope', { seg: 8 }), cyl(mid, G_r, 0.011, 'rope', { seg: 8 }),
      cyl(madd(G_l, nrm(sub(G_l, mid)), 0.0), madd(G_l, nrm(sub(G_l, mid)), 0.03), 0.02, 'plate', { seg: 10 }),
      cyl(madd(G_r, nrm(sub(G_r, mid)), 0.0), madd(G_r, nrm(sub(G_r, mid)), 0.03), 0.02, 'plate', { seg: 10 }),
      cableLine(mid, anchor)];
  }
  function dHandle(G, t) { return [cyl(madd(G, t, -0.06), madd(G, t, 0.06), 0.016, 'plate', { seg: 10 })]; }
  function plyoBox(c, s) { return [box(c, s, 'box', { solid: true, support: true })]; }

  // ------------------------------------------------------------------ waves
  function cycleWave(u) {
    var phase, p;
    if (u < 0.42) { phase = 'ECCENTRIC'; p = ease(u / 0.42); }
    else if (u < 0.55) { phase = 'PEAK TENSION'; p = 1; }
    else if (u < 0.88) { phase = 'DRIVE / LOCKOUT'; p = 1 - ease((u - 0.55) / 0.33); }
    else { phase = 'RESET / BRACE'; p = 0; }
    return { p: p, phase: phase };
  }
  function concentricFirst(u) {
    // lifts that start at the bottom (pulls/raises/curls): drive first, controlled lowering
    var phase, p;
    if (u < 0.36) { phase = 'DRIVE / LOCKOUT'; p = ease(u / 0.36); }
    else if (u < 0.5) { phase = 'PEAK TENSION'; p = 1; }
    else if (u < 0.9) { phase = 'ECCENTRIC'; p = 1 - ease((u - 0.5) / 0.4); }
    else { phase = 'RESET / BRACE'; p = 0; }
    return { p: p, phase: phase };
  }
  function holdWave(u) { return { p: 0.5 - 0.5 * Math.cos(u * Math.PI * 2), phase: u < 0.5 ? 'PEAK TENSION' : 'RESET / BRACE' }; }

  // ------------------------------------------------------------------ clips
  var CLIPS = {};
  function clip(id, def) { def.id = id; CLIPS[id] = def; return def; }

  // ---- standing base (used by many clips)
  function standing(rig, B, o) {
    o = o || {};
    var legs = plantedLegs(B, o.feet || {});
    var spec = { pelvis: { pos: [0, B.pelvis[1], o.pz || 0], rot: o.prot || [0, 0, 0] }, spine: o.spine, chest: o.chest, neck: o.neck, head: o.head, clav: o.clav, legs: legs, arms: o.arms || {} };
    spec.pelvis.pos[1] = legReachPelvisY(rig, spec, o.legFrac || 0.985);
    return spec;
  }
  function hangArms(B, s, o) { return { mode: 'fk', u: [s * 0.13, -1, 0.05], flexDir: Zv, flex: 10, sup: 0, curl: (o && o.curl) || 0.3 }; }

  // ===== 1. Barbell bench press (flat) =====================================
  clip('bench', {
    cam: [52, 20], presets: { front: [140, 22], threeq: [52, 20], side: [90, 10] },
    setup: function (rig, B) {
      var spec = { pelvis: { pos: [0, 0.62, 0.33], rot: [-90, 0, 0] }, spine: [-4, 0, 0], chest: [-7, 0, 0], neck: [6, 0, 0], head: [0, 0, 0], clav: { both: [-6, 10] }, arms: {} };
      spec.legs = plantedLegs(B, { w: 0.3, z: 0.33 + 0.46, toeOut: 22, kneeOut: 0.4 });
      ['l', 'r'].forEach(function (sd) { spec.legs[sd].pole = [sd === 'l' ? 0.6 : -0.6, 1, 0.35]; });
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; spec.arms[sd] = { mode: 'fk', u: [s * 0.2, 1, 0], flexDir: Zv, flex: 5, curl: 1 }; });
      var top = 0.445, fk = trunkFK(rig, spec);
      var z0 = fk.P.head[2] - 0.14, z1 = spec.pelvis.pos[2] + 0.17;
      for (var it = 0; it < 3; it++) { var low = lowestOver(rig, spec, Y, function (q) { return Math.abs(q[0]) < 0.145 && q[2] > z0 && q[2] < z1; }); spec.pelvis.pos[1] += (top - 0.005) - low; }
      var pose0 = solve(rig, spec);
      fk = trunkFK(rig, spec);
      var chestTop = extremeAlong(rig, pose0, groupVerts(rig, ['chest'], 2, function (x) { return Math.abs(x) < 0.11; }), Y).value;
      var tuck = 52 * DEG, sol = {};
      ['l', 'r'].forEach(function (sd) {
        var s = rig.side[sd].s, S = fk.P['S_' + sd], L1 = rig.side[sd].L1, L2 = rig.side[sd].L2;
        var beta = bisect(function (b) {
          var dir = [s * Math.sin(tuck) * Math.cos(b), -Math.sin(b), Math.cos(tuck) * Math.cos(b)];
          var W = add(madd(S, dir, L1), [0, L2, 0]);
          return W[1] + B.gD - (chestTop + 0.016);
        }, -0.3, 1.2);
        var dir = [s * Math.sin(tuck) * Math.cos(beta), -Math.sin(beta), Math.cos(tuck) * Math.cos(beta)];
        var Wb = add(madd(S, dir, L1), [0, L2, 0]);
        sol[sd] = { Gb: add(Wb, [0, B.gD, B.gN]), S: S };
      });
      var gw = (Math.abs(sol.l.Gb[0]) + Math.abs(sol.r.Gb[0])) / 2, zb = sol.l.Gb[2], yb = sol.l.Gb[1];
      var S = sol.l.S, zt = S[2] + 0.025;
      var yt = bisect(function (y) { var W = [gw, y - B.gD, zt - B.gN]; return len(sub(W, S)) - B.reach * 0.988; }, S[1], S[1] + 0.7);
      // vertical-forearm path: upper arm keeps its lateral component (fixed grip width) while the elbow rises
      var ux = (gw - S[0]) / B.L1, rr = Math.sqrt(Math.max(1 - ux * ux, 0)), eB = (sol.l.Gb[1] - B.gD - B.L2 - S[1]) / B.L1;
      function vpath(e) { var uz = Math.sqrt(Math.max(rr * rr - e * e, 0)); return [gw, S[1] + B.L1 * e + B.L2 + B.gD, S[2] + B.L1 * uz + B.gN]; }
      return { spec: spec, gw: gw, yb: yb, zb: zb, yt: yt, zt: zt, top: top, z0: z0, z1: z1, eB: eB, eM: rr * 0.55, vpath: vpath };
    },
    pose: function (p, rig, B, c) {
      var y, z, pm = 0.45;
      if (p >= pm) { var g = c.vpath(lerp(c.eM, c.eB, (p - pm) / (1 - pm))); y = g[1]; z = g[2]; }
      else { var gm = c.vpath(c.eM), t = smooth(p / pm); y = lerp(c.yt, gm[1], t); z = lerp(c.zt, gm[2], t); }
      var spec = Object.assign({}, c.spec, { arms: {} });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, G = [s * c.gw, y, z];
        spec.arms[sd] = grip(G, Y, [-s, 0, 0], { aim: [G[0], y - B.gD - B.L2, z - B.gN] });
      });
      return {
        spec: spec,
        props: function () {
          return flatBench(c.z0, c.z1 + 0.06, c.top)
            .concat([box([0.56, 0.6, c.zt - 0.05], [0.07, 1.2, 0.07], 'frame'), box([-0.56, 0.6, c.zt - 0.05], [0.07, 1.2, 0.07], 'frame'),
              box([0.56, 0.02, c.zt - 0.05], [0.12, 0.04, 0.5], 'frame'), box([-0.56, 0.02, c.zt - 0.05], [0.12, 0.04, 0.5], 'frame'),
              box([0.56, 1.06, c.zt - 0.0], [0.07, 0.03, 0.1], 'accent'), box([-0.56, 1.06, c.zt - 0.0], [0.07, 0.03, 0.1], 'accent')])
            .concat(barbellProps([0, y, z], Xv, [[0.225, 0.045], [0.225, 0.045]]));
        },
        contacts: { feet: ['l', 'r'], support: true, grips: ['l', 'r'], flush: 'torso' },
        checks: { forearmVertical: { minP: 0.5, maxDeg: 8 }, elbowTuck: { atP: 1, min: 35, max: 65 } }
      };
    }
  });

  // ===== 2. Incline dumbbell press (30 deg) ================================
  function inclineSeat(rig, B, ang, spec, seatTop, padHalfW) {
    // seat: lowest vertex over the seat footprint; back pad: plane fitted to the lowest back vertices
    var fk = trunkFK(rig, spec), hipC = lerp3(fk.P.hip_l, fk.P.hip_r, 0.5);
    for (var it = 0; it < 3; it++) { var low = lowestOver(rig, spec, Y, function (q) { return Math.abs(q[0]) < 0.16 && q[2] > hipC[2] - 0.17 && q[2] < hipC[2] + 0.2; }); spec.pelvis.pos[1] += (seatTop - 0.005) - low; }
    var a = ang * DEG, nB = [0, Math.cos(a), Math.sin(a)];
    var c = lowestOver(rig, spec, nB, function (q) { return Math.abs(q[0]) < padHalfW && q[1] > seatTop + 0.09; });
    var planeC = c - 0.005;
    var zA = (planeC - nB[1] * (seatTop + 0.035)) / nB[2];
    return { zA: zA, planeC: planeC, nB: nB, dirB: [0, Math.sin(a), -Math.cos(a)], hipZ: hipC[2], seatZ0: Math.min(zA, hipC[2] - 0.17), seatZ1: hipC[2] + 0.2 };
  }
  function inclineBenchProps(c, w) {
    var out = [inclinePad([0, c.seatTop + 0.035, c.zA], c.ang, 0.84, w)];
    var sz0 = c.seatZ0 != null ? c.seatZ0 : c.zA, sz1 = c.seatZ1 != null ? c.seatZ1 : c.zA + 0.39;
    out.push(box([0, c.seatTop - 0.0325, (sz0 + sz1) / 2], [0.3, 0.065, sz1 - sz0], 'pad', { solid: true, support: true }));
    out.push(box([0, (c.seatTop - 0.065) / 2, c.zA + 0.14], [0.08, c.seatTop - 0.065, 0.08], 'frame'));
    out.push(box([0, 0.02, c.zA + 0.14], [0.44, 0.04, 0.08], 'frame'));
    out.push(box([0, 0.02, c.zA - 0.55], [0.44, 0.04, 0.08], 'frame'));
    var a = c.ang * DEG, topEnd = [0, c.seatTop + 0.035 + Math.sin(a) * 0.6 - 0.05, c.zA - Math.cos(a) * 0.6 - 0.03];
    out.push(cyl([0, 0.02, c.zA - 0.55], topEnd, 0.03, 'frame'));
    return out;
  }
  clip('inclineDB', {
    cam: [48, 16], presets: { front: [150, 18], threeq: [48, 16], side: [90, 8] },
    setup: function (rig, B) {
      var ang = 30;
      var spec = { pelvis: { pos: [0, 0.62, 0.0], rot: [-(90 - ang), 0, 0] }, spine: [-3, 0, 0], chest: [-5, 0, 0], neck: [6, 0, 0], clav: { both: [-4, 8] }, arms: {} };
      spec.legs = plantedLegs(B, { w: 0.27, z: 0.5, toeOut: 18 });
      ['l', 'r'].forEach(function (sd) { spec.legs[sd].pole = [sd === 'l' ? 0.4 : -0.4, 1, 0.5]; spec.arms[sd] = { mode: 'fk', u: [sd === 'l' ? 0.2 : -0.2, 1, 0.1], flexDir: Zv, flex: 5, curl: 1 }; });
      var seatTop = 0.46, fit = inclineSeat(rig, B, ang, spec, seatTop, 0.145);
      var up_t = fit.dirB, front_t = fit.nB, tuck = 56 * DEG, beta = 24 * DEG, U = {};
      ['l', 'r'].forEach(function (sd) {
        var s = rig.side[sd].s;
        U[sd] = { b: nrm(add(add(scl([s, 0, 0], Math.sin(tuck) * Math.cos(beta)), scl(up_t, -Math.cos(tuck) * Math.cos(beta))), scl(front_t, -Math.sin(beta)))), t: nrm([-s * 0.07, 1, 0.12]) };
      });
      return { spec: spec, U: U, zA: fit.zA, seatZ0: fit.seatZ0, seatZ1: fit.seatZ1, seatTop: seatTop, ang: ang };
    },
    pose: function (p, rig, B, c) {
      var spec = Object.assign({}, c.spec, { arms: {} });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, u = nrm(lerp3(c.U[sd].t, c.U[sd].b, p));
        spec.arms[sd] = { mode: 'fk', u: u, fore: Y, d: Y, t: [-s, 0, 0], curl: 1 };
      });
      return {
        spec: spec,
        props: function (pose) {
          var out = inclineBenchProps(c);
          ['l', 'r'].forEach(function (sd) { out = out.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd])); });
          return out;
        },
        contacts: { feet: ['l', 'r'], support: true, grips: ['l', 'r'], flush: 'torso' },
        checks: { forearmVertical: { maxDeg: 3 }, elbowTuck: { atP: 1, min: 35, max: 70 } }
      };
    }
  });

  // ===== 3-5. Push-up family ================================================
  function plankClip(id, variant) {
    clip(id, {
      cam: [52, 14], presets: { front: [0, 14], threeq: [52, 14], side: [90, 6] },
      setup: function (rig, B) {
        var decl = variant === 'decline', diamond = variant === 'diamond';
        var footY = decl ? 0.45 : 0;
        var Rf = rx(68 * DEG);
        var feet = {};
        ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; feet[sd] = ballFoot(rig, B, sd, Rf, footY, s * 0.09, -0.5); });
        // body line pitch theta: pelvis rot = 90 - theta
        function specFor(th) {
          var sp = { pelvis: { pos: [0, 0, 0], rot: [90 - th, 0, 0] }, spine: [0, 0, 0], chest: [0, 0, 0], neck: [-14, 0, 0], head: [-6, 0, 0], clav: { both: [0, 4] }, arms: {}, legs: {} };
          // straight legs: pelvis hip-centre at fixed distance along body line from ankles
          var ankMid = lerp3(feet.l.ankle, feet.r.ankle, 0.5), dirB = [0, Math.sin(th * DEG), Math.cos(th * DEG)];
          var hipC = madd(ankMid, dirB, B.leg * 0.992);
          sp.anchor = { point: 'hips', pos: hipC };
          ['l', 'r'].forEach(function (sd) { sp.legs[sd] = { ankle: feet[sd].ankle, Rfoot: feet[sd].Rfoot, toeFlat: true, pole: [0, -1, 0.3] }; });
          return sp;
        }
        var handX = diamond ? 0.045 : B.shoulderX + 0.07;
        var Wy = 0.028 + footY * 0;
        // top: arms straight
        var thTop = bisect(function (th) {
          var fk = trunkFK(rig, specFor(th)), S = fk.P.S_l;
          return (S[1] - Wy) - B.reach * 0.975;
        }, -40, 45);
        var fkT = trunkFK(rig, specFor(thTop));
        var handZ = fkT.P.S_l[2] + (diamond ? 0.1 : 0.02);
        // bottom: sternum ~5 cm above floor
        var sternum = [0, B.chest[1] + 0.07, B.chestFrontZ], face = add(B.head, [0, 0.06, 0.1]);
        function armsFor(sp) {
          ['l', 'r'].forEach(function (sd) {
            var s = sd === 'l' ? 1 : -1, d = diamond ? nrm([-s * 0.75, 0, 0.66]) : nrm([s * 0.12, 0, 1]);
            var W = add(add([s * handX, 0, handZ], scl(d, -0.046 * rig.side[sd].hs)), [0, 0.031, 0]);
            sp.arms[sd] = { mode: 'wrist', W: W, d: d, n: [0, -1, 0], curl: -0.22, pole: diamond ? [s * 0.35, 0.2, -1] : [s * 0.75, 0.25, -0.65] };
          });
          return sp;
        }
        var thBot = bisect(function (th) {
          var sp = armsFor(specFor(th)), fk = trunkFK(rig, sp), pose = solve(rig, sp);
          var clear = Math.min(bonePoint(rig, fk, 'chest', sternum)[1] - 0.055, bonePoint(rig, fk, 'head', face)[1] - 0.06, Math.min(pose.pts.E_l[1], pose.pts.E_r[1]) - 0.06);
          return clear;
        }, -50, thTop);
        return { specFor: specFor, thTop: thTop, thBot: thBot, handX: handX, handZ: handZ, feet: feet, decl: decl, diamond: diamond };
      },
      pose: function (p, rig, B, c) {
        var th = lerp(c.thTop, c.thBot, p);
        var spec = c.specFor(th);
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1;
          var d = c.diamond ? nrm([-s * 0.75, 0, 0.66]) : nrm([s * 0.12, 0, 1]);
          var palmC = [s * c.handX, 0, c.handZ];
          var W = add(add(palmC, scl(d, -0.046 * rig.side[sd].hs)), [0, 0.031, 0]);
          var pole = c.diamond ? [s * 0.35, 0.2, -1] : [s * 0.75, 0.25, -0.65];
          spec.arms[sd] = { mode: 'wrist', W: W, d: d, n: [0, -1, 0], curl: -0.22, pole: pole };
        });
        return {
          spec: spec,
          props: c.decl ? plyoBox([0, 0.225, c.feet.l.ankle[2] - 0.05], [0.6, 0.45, 0.5]) : [],
          contacts: { hands: ['l', 'r'], feetToes: ['l', 'r'], support: c.decl, toesOn: c.decl ? 0.45 : 0 },
          checks: { plank: { maxSagDeg: 6 } }
        };
      }
    });
  }
  plankClip('pushup', 'standard'); plankClip('pushupDiamond', 'diamond'); plankClip('pushupDecline', 'decline');

  // ===== 6. Pike push-up ===================================================
  clip('pike', {
    cam: [64, 10], presets: { front: [0, 10], threeq: [64, 10], side: [90, 4] },
    setup: function (rig, B) {
      var fk0 = trunkFK(rig, { pelvis: { pos: [0, 1, 0], rot: [0, 0, 0] } });
      var trunkLen = len(sub(lerp3(fk0.P.S_l, fk0.P.S_r, 0.5), lerp3(fk0.P.hip_l, fk0.P.hip_r, 0.5)));
      var hipOff = sub(fk0.P.pelvis, lerp3(fk0.P.hip_l, fk0.P.hip_r, 0.5));
      var Wy = 0.03, handZ = 0.0;
      var tTop = 52 * DEG; // trunk angle below horizontal at the top (arms in line with trunk)
      var Smid = [0, Wy + Math.sin(tTop) * B.reach * 0.975, handZ - Math.cos(tTop) * B.reach * 0.975];
      var Hc = [0, Smid[1] + Math.sin(tTop) * trunkLen, Smid[2] - Math.cos(tTop) * trunkLen];
      var Rf = rx(34 * DEG), feet = {};
      var ankH = ballFoot(rig, B, 'l', Rf, 0, 0, 0).ankle[1];
      var legA = Math.asin(clamp((Hc[1] - ankH) / (B.leg * 0.994), -1, 1));
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; var f0 = ballFoot(rig, B, sd, Rf, 0, 0, 0); var dz = -f0.ankle[2]; feet[sd] = ballFoot(rig, B, sd, Rf, 0, s * 0.11, Hc[2] - Math.cos(legA) * B.leg * 0.994 + dz); });
      function specFor(tAng, hc) {
        // trunk points from hips down-forward toward the hands: pelvis pitch = 180 - (90 - tAng)
        var sp = { pelvis: { pos: [0, 0, 0], rot: [90 + tAng / DEG, 0, 0] }, neck: [-16, 0, 0], head: [-8, 0, 0], clav: { both: [16, 2] }, arms: {}, legs: {} };
        sp.anchor = { point: 'hips', pos: hc };
        return sp;
      }
      var tBot = bisect(function (t) { var f = trunkFK(rig, specFor(t, add(Hc, [0, -0.02, 0.03]))); return bonePoint(rig, f, 'head', B.top)[1] - 0.06; }, tTop, 85 * DEG);
      return { specFor: specFor, Hc: Hc, feet: feet, tTop: tTop, tBot: tBot, handZ: handZ, Wy: Wy };
    },
    pose: function (p, rig, B, c) {
      var sp = c.specFor(lerp(c.tTop, c.tBot, p), add(c.Hc, [0, -0.02 * p, 0.03 * p]));
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1;
        sp.legs[sd] = { ankle: c.feet[sd].ankle, Rfoot: c.feet[sd].Rfoot, toeFlat: true, pole: [0, -0.3, 1] };
        var d = nrm([s * 0.12, 0, 1]);
        var palmC = [s * (B.shoulderX + 0.05), 0, c.handZ + 0.03];
        var W = add(add(palmC, scl(d, -0.046 * rig.side[sd].hs)), [0, 0.031, 0]);
        sp.arms[sd] = { mode: 'wrist', W: W, d: d, n: [0, -1, 0], curl: -0.22, pole: [s * 0.6, 0.35, -0.7] };
      });
      return { spec: sp, props: [], contacts: { hands: ['l', 'r'], feetToes: ['l', 'r'] } };
    }
  });

  // ===== 7. Weighted dip ===================================================
  clip('dip', {
    cam: [40, 12], presets: { front: [0, 10], threeq: [40, 12], side: [90, 6] },
    setup: function (rig, B) {
      var barY = 1.18, barX = B.shoulderX + 0.075, d = nrm([0.3, 1, 0.1]);
      var W = sub(sub([barX, barY, 0], scl(d, B.gD)), scl(nrm(perp([-1, 0.3, 0], d)), B.gN));
      var Stop = [0, W[1] + Math.sqrt(Math.max(Math.pow(B.reach * 0.975, 2) - Math.pow(B.shoulderX - W[0], 2), 0)), -0.02];
      var E = add(W, [0, B.L2 * 0.995, -0.03]);
      var Sb = add(E, [0, -Math.sin(8 * DEG) * B.L1, Math.cos(8 * DEG) * B.L1 * 0.98]);
      return { barY: barY, barX: barX, Stop: Stop, Sbot: [0, Sb[1], Sb[2]], E: E };
    },
    pose: function (p, rig, B, c) {
      var Sm = lerp3(c.Stop, c.Sbot, p);
      var sp = { pelvis: { pos: [0, 1, 0], rot: [lerp(6, 26, p), 0, 0] }, chest: [lerp(0, 8, p), 0, 0], neck: [lerp(-6, -18, p), 0, 0], clav: { both: [lerp(-12, 4, p), lerp(0, -6, p)] }, arms: {}, legs: {} };
      sp.anchor = { point: 'shoulders', pos: Sm };
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, G = [s * c.barX, c.barY, 0.0];
        var aim = [s * c.E[0], lerp(c.Stop[1] - B.L1 * 0.9, c.E[1], p), lerp(0.02, c.E[2], p)];
        sp.arms[sd] = grip(G, nrm([s * 0.3, 1, 0.1]), [0, 0, 1], { aim: aim });
        sp.legs[sd] = { mode: 'fk', u: [s * 0.04, -1, sd === 'l' ? 0.22 : 0.3], flexDir: [0, 0, -1], flex: sd === 'l' ? 78 : 86, plantar: 25 };
      });
      return {
        spec: sp,
        props: function (pose) {
          var out = [];
          [-1, 1].forEach(function (s) {
            out.push(cyl([s * c.barX, c.barY, -0.42], [s * c.barX, c.barY, 0.42], 0.022, 'chrome', { seg: 14 }));
            out.push(cyl([s * (c.barX + 0.02), 0, -0.38], [s * (c.barX + 0.02), c.barY, -0.38], 0.028, 'frame'));
            out.push(cyl([s * (c.barX + 0.02), 0, 0.38], [s * (c.barX + 0.02), c.barY, 0.38], 0.028, 'frame'));
            out.push(box([s * (c.barX + 0.02), 0.02, 0], [0.1, 0.04, 0.9], 'frame'));
          });
          var hipC = lerp3(pose.pts.hip_l, pose.pts.hip_r, 0.5), pl = add(hipC, [0, -0.36, 0.06]);
          out.push(cyl(add(hipC, [0, -0.05, 0.1]), add(pl, [0, 0.12, 0]), 0.006, 'cable', { seg: 6 }));
          out.push(cyl(add(pl, [0, 0, -0.02]), add(pl, [0, 0, 0.02]), 0.13, 'plate', { seg: 24 }));
          return out;
        },
        contacts: { grips: ['l', 'r'], airborne: true },
        checks: { forearmVertical: { minP: 0.95, maxDeg: 18 } }
      };
    }
  });

  // ===== 8. Cable fly =====================================================
  clip('cableFly', {
    cam: [22, 12], presets: { front: [0, 10], threeq: [32, 12], side: [90, 6] },
    setup: function (rig, B) { return { spec: standing(rig, B, { feet: { l: { z: 0.12 }, r: { z: -0.2 }, w: 0.14 }, prot: [10, 0, 0], legFrac: 0.975 }) }; },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.spec, { arms: {}, chest: [lerp(0, 6, p), 0, 0], clav: { both: [0, lerp(-10, 12, p)] } });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1;
        var u0 = nrm([s * 0.92, -0.25, -0.22]), u1 = nrm([s * 0.2, -0.45, 0.88]);
        var u = nrm(lerp3(u0, u1, p));
        sp.arms[sd] = { mode: 'fk', u: u, flexDir: nrm([-s * 0.4, 0.1, 1]), flex: 24, sup: lerp(-10, 0, p), curl: 1, wflex: 0 };
      });
      return {
        spec: sp,
        props: function (pose) {
          var out = [];
          ['l', 'r'].forEach(function (sd) {
            var s = sd === 'l' ? 1 : -1, P = [s * 1.05, 1.92, -0.3];
            out = out.concat(cableTower([s * 1.05, 0, -0.3], 1.92));
            out.push(cableLine(P, pose.pts['G_' + sd]));
            out = out.concat(dHandle(pose.pts['G_' + sd], pose.pts['t_' + sd]));
          });
          return out;
        },
        contacts: { feet: ['l', 'r'] }
      };
    }
  });

  // ===== 9-10. Overhead presses ==============================================
  function ohpClip(id, db) {
    clip(id, {
      cam: [34, 10], presets: { front: [0, 8], threeq: [34, 10], side: [90, 4] }, wave: concentricFirst,
      setup: function (rig, B) {
        var base = standing(rig, B, { feet: { w: B.hipX + 0.05 }, legFrac: 0.985 });
        var fk = trunkFK(rig, base), S = fk.P.S_l, mf = midfoot(base.legs, 'l');
        return { base: base, S: S, mf: mf };
      },
      pose: function (p, rig, B, c) {
        var lean = lerp(-5, 0, smooth(p * 1.4));
        var sp = Object.assign({}, c.base, { arms: {}, pelvis: { pos: [0, c.base.pelvis.pos[1], lerp(0.015, 0, p)], rot: [lean, 0, 0] }, neck: [lerp(-4, 2, smooth(seg(p, 0.2, 0.7))) - 8 * Math.sin(Math.PI * seg(p, 0.0, 0.45)), 0, 0], clav: { both: [lerp(-2, 16, smooth(seg(p, 0.5, 1))), lerp(4, 0, p)] } });
        var fk = trunkFK(rig, sp);
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1, Sd = fk.P['S_' + sd];
          if (db) {
            // forearms vertical through the whole press: upper arm rotates from the scapular plane to overhead
            var ub = nrm([s * 0.93, -0.12, 0.34]), ut = nrm([-s * 0.07, 1, 0.03]);
            sp.arms[sd] = { mode: 'fk', u: nrm(lerp3(ub, ut, p)), fore: Y, d: Y, t: [-s, 0, 0], curl: 1 };
          } else {
            var gw = B.shoulderX + 0.075, z = c.mf[2] + 0.03;
            var dB = nrm([0, 1, -0.36]), nB = nrm([0, 0.36, 1]);
            var Eb = madd(Sd, nrm([s * 0.075, -0.275, 0.08]), B.L1), Wb = add(Eb, [0, B.L2, 0]);
            var yb = add(add(Wb, scl(dB, B.gD)), scl(nB, B.gN))[1];
            var yt = bisect(function (y) { return len(sub([s * gw, y - B.gD, z - B.gN], Sd)) - B.reach * 0.985; }, Sd[1], Sd[1] + 0.8);
            var zz = lerp(z + 0.07, z, smooth(seg(p, 0.0, 0.55)));
            var G = [s * gw, lerp(yb, yt, p), zz];
            var dd = nrm(lerp3(dB, Y, smooth(seg(p, 0.3, 1)))), nn = nrm(lerp3(nB, [0, 0, 1], smooth(seg(p, 0.3, 1))));
            var Wd = sub(sub(G, scl(dd, B.gD)), scl(nn, B.gN));
            sp.arms[sd] = { mode: 'grip', G: G, d: dd, n: nn, curl: 1, aim: [Wd[0] + s * 0.015, Wd[1] - B.L2, Wd[2] + 0.02] };
          }
        });
        return {
          spec: sp,
          props: db ? function (pose) { var o = []; ['l', 'r'].forEach(function (sd) { o = o.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd], 0.9)); }); return o; }
            : function (pose) { return barbellProps(lerp3(pose.pts.G_l, pose.pts.G_r, 0.5), Xv, [[0.225, 0.035]]); },
          contacts: { feet: ['l', 'r'], grips: ['l', 'r'] },
          checks: { forearmVertical: db ? { maxDeg: 3 } : { maxP: 0.1, maxDeg: 17 } }
        };
      }
    });
  }
  ohpClip('ohp', false); ohpClip('dbPress', true);

  // ===== 11. Lateral raise ===================================================
  clip('lateral', {
    cam: [18, 10], presets: { front: [0, 8], threeq: [30, 10], side: [90, 4] }, wave: concentricFirst,
    setup: function (rig, B) { return { base: standing(rig, B, { prot: [6, 0, 0], legFrac: 0.98 }) }; },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.base, { arms: {}, clav: { both: [lerp(0, 9, p), 2] } });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, a = lerp(12, 88, p) * DEG, plane = 26 * DEG;
        var u = nrm([s * Math.sin(a) * Math.cos(plane), -Math.cos(a), Math.sin(a) * Math.sin(plane) + 0.08]);
        sp.arms[sd] = { mode: 'fk', u: u, flexDir: [0, lerp(0, 0.3, p), 1], flex: 16, sup: lerp(0, -12, p), curl: 1 };
      });
      return { spec: sp, props: function (pose) { var o = []; ['l', 'r'].forEach(function (sd) { o = o.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd], 0.75)); }); return o; }, contacts: { feet: ['l', 'r'] }, checks: { raiseHeight: { atP: 1, maxAboveShoulder: 0.06 } } };
    }
  });

  // ===== 12. Face pull ====================================================
  clip('facePull', {
    cam: [112, 10], presets: { front: [180, 10], threeq: [135, 12], side: [90, 6] }, wave: concentricFirst,
    setup: function (rig, B) { return { base: standing(rig, B, { feet: { l: { z: 0.06 }, r: { z: -0.14 } }, prot: [-6, 0, 0], legFrac: 0.975 }) }; },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.base, { arms: {}, clav: { both: [lerp(0, 4, p), lerp(14, -16, p)] }, chest: [lerp(2, -4, p), 0, 0] });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1;
        var u = nrm(lerp3([s * 0.18, 0.08, 1], [s * 1, 0.12, -0.28], p));
        var fd = nrm(lerp3([0, 1, 0.1], [0, 1, -0.35], p));
        sp.arms[sd] = { mode: 'fk', u: u, flexDir: fd, flex: lerp(8, 104, p), sup: lerp(-15, 10, p), curl: 1 };
      });
      var P = [0, 1.66, 1.35];
      return {
        spec: sp,
        props: function (pose) { return cableTower([0, 0, 1.35], 1.66).concat(ropeHandle(pose.pts.G_l, pose.pts.G_r, P)); },
        contacts: { feet: ['l', 'r'] },
        checks: { externalRotation: { atP: 1 } }
      };
    }
  });

  // ===== 13-15. Hanging: pull-up / chin-up / fat-grip hold / leg raise ======
  function hangClip(id, kind) {
    clip(id, {
      cam: [30, 8], presets: { front: [0, 6], threeq: [30, 8], side: [90, 2] }, wave: kind === 'hold' ? holdWave : (kind === 'legRaise' ? concentricFirst : concentricFirst),
      setup: function (rig, B) {
        var sup = kind === 'chin';
        var gw = sup ? B.shoulderX - 0.02 : (kind === 'hold' ? B.shoulderX + 0.04 : B.shoulderX + 0.12);
        var barY = 2.28 + (B.female ? -0.1 : 0);
        return { gw: gw, barY: barY, sup: sup, fat: kind === 'hold' };
      },
      pose: function (p, rig, B, c) {
        var hang = kind === 'hold' || kind === 'legRaise';
        var pull = hang ? 0 : p;
        var lean = lerp(0, kind === 'chin' ? 8 : 14, pull);
        var sp = { pelvis: { pos: [0, 1, 0], rot: [-lean * 0.6, 0, 0] }, spine: [-lean * 0.2, 0, 0], chest: [-lean * 0.5, 0, 0], neck: [lerp(0, -6, pull), 0, 0],
          clav: { both: [lerp(22, -6, smooth(seg(pull, 0, 0.5))) + (kind === 'hold' ? -8 * p : 0), lerp(0, -10, pull)] }, arms: {}, legs: {} };
        var hangDrop = B.reach * 0.965 + B.gD;
        var Sy = lerp(c.barY - hangDrop + 0.03 + (kind === 'hold' ? 0.035 * p : 0), c.barY - 0.13, smooth(pull));
        if (kind === 'legRaise') {
          sp.spine = [lerp(0, -22, p), 0, 0];
          sp.pelvis.rot = [lerp(0, -12, p), 0, 0];
        }
        sp.anchor = { point: 'shoulders', pos: [0, Sy, lerp(0.0, -0.05, pull) + (kind === 'legRaise' ? -0.06 * p : 0)] };
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1, G = [s * c.gw, c.barY, 0];
          var pole = c.sup ? [s * 0.25, -1, 0.5] : [s * 1, -0.85, -0.35];
          sp.arms[sd] = grip(G, Y, c.sup ? [s, 0, 0] : [-s, 0, 0], { pole: pole, gN: c.fat ? B.gN + 0.016 : B.gN, curl: c.fat ? 0.72 : 1 });
          if (kind === 'legRaise') sp.legs[sd] = { mode: 'fk', u: nrm([s * 0.03, -Math.cos(lerp(4, 84, p) * DEG), Math.sin(lerp(4, 84, p) * DEG)]), flexDir: [0, -0.2, -1], flex: lerp(6, 14, p), plantar: 20 };
          else sp.legs[sd] = { mode: 'fk', u: [s * 0.03, -1, lerp(0.06, 0.18, pull)], flexDir: [0, 0, -1], flex: lerp(14, 32, pull), plantar: 28 };
        });
        return {
          spec: sp,
          props: function () {
            var r = c.fat ? 0.032 : 0.016;
            var out = [cyl([-0.75, c.barY, 0], [0.75, c.barY, 0], 0.016, 'chrome', { seg: 14 }), cyl([-0.75, 0, 0], [-0.75, c.barY + 0.05, 0], 0.03, 'frame'), cyl([0.75, 0, 0], [0.75, c.barY + 0.05, 0], 0.03, 'frame'),
              box([-0.75, 0.02, 0], [0.12, 0.04, 0.7], 'frame'), box([0.75, 0.02, 0], [0.12, 0.04, 0.7], 'frame')];
            if (c.fat) [-1, 1].forEach(function (s) { out.push(cyl([s * (c.gw - 0.06), c.barY, 0], [s * (c.gw + 0.06), c.barY, 0], r, 'accent', { seg: 16 })); });
            return out;
          },
          contacts: { grips: ['l', 'r'], airborne: true },
          checks: kind === 'legRaise' ? { pelvicCurl: { atP: 1, minSpineFlex: 15 } } : {}
        };
      }
    });
  }
  hangClip('pullup', 'pull'); hangClip('chinup', 'chin'); hangClip('fatGripHold', 'hold'); hangClip('legRaise', 'legRaise');

  // ===== 16. Lat pulldown ===================================================
  clip('pulldown', {
    cam: [34, 10], presets: { front: [180, 10], threeq: [34, 10], side: [90, 4] }, wave: concentricFirst,
    setup: function (rig, B) {
      var seatTop = B.Ls + B.ankleH - 0.03;
      var sp = { pelvis: { pos: [0, 0.6, 0], rot: [-10, 0, 0] }, arms: {} };
      sp.legs = plantedLegs(B, { w: 0.15, z: B.Lt + 0.04, toeOut: 6 });
      ['l', 'r'].forEach(function (sd) { sp.legs[sd].pole = [0, 1, 0.6]; });
      ['l', 'r'].forEach(function (sd) { sp.arms[sd] = { mode: 'fk', u: [sd === 'l' ? 0.3 : -0.3, 1, 0], flexDir: Zv, flex: 5, curl: 1 }; });
      for (var it = 0; it < 4; it++) { var low = lowestOver(rig, sp, Y, function (q) { return Math.abs(q[0]) < 0.18 && q[2] > -0.16 && q[2] < 0.2; }); sp.pelvis.pos[1] += (seatTop - 0.005) - low; }
      var fk = trunkFK(rig, sp);
      var thighTop = extremeAlong(rig, solve(rig, sp), groupVerts(rig, ['thigh_l'], 2), Y).value;
      return { sp: sp, seatTop: seatTop, gw: B.shoulderX + 0.2, S: fk.P.S_l, thighTop: thighTop };
    },
    pose: function (p, rig, B, c) {
      var lean = lerp(-10, -22, p);
      var sp = Object.assign({}, c.sp, { pelvis: { pos: c.sp.pelvis.pos.slice(), rot: c.sp.pelvis.rot.slice() }, spine: [lean + 10, 0, 0], chest: [lerp(0, -8, p), 0, 0], neck: [lerp(-6, 4, p), 0, 0], clav: { both: [lerp(20, -8, smooth(seg(p, 0, 0.5))), lerp(0, -12, p)] }, arms: {} });
      var fk = trunkFK(rig, sp), S = fk.P.S_l;
      var yTop = S[1] + B.reach * 0.915 + B.gD, yBot = S[1] + 0.03;
      var y = lerp(yTop, yBot, p), z = lerp(S[2] + 0.06, S[2] + 0.13, p);
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, G = [s * c.gw, y, z];
        sp.arms[sd] = grip(G, Y, [-s, 0, 0], { pole: [s * 1, -1, -0.45] });
      });
      return {
        spec: sp,
        props: function (pose) {
          var mid = lerp3(pose.pts.G_l, pose.pts.G_r, 0.5);
          var out = [box([0, c.seatTop - 0.0325, 0.02], [0.36, 0.065, 0.36], 'pad', { solid: true, support: true }), box([0, (c.seatTop - 0.065) / 2, 0.02], [0.08, c.seatTop - 0.065, 0.08], 'frame'),
            box([0, c.thighTop + 0.045, 0.3], [0.42, 0.08, 0.1], 'pad'), box([0, (c.thighTop + 0.01) / 2, 0.36], [0.05, c.thighTop + 0.01, 0.05], 'frame'),
            box([0, 1.15, -0.32], [0.14, 2.3, 0.14], 'frame'), box([0, 2.32, -0.05], [0.12, 0.08, 0.6], 'frame'), box([0, 0.03, -0.1], [0.6, 0.06, 0.9], 'frame'),
            cyl([0, 2.3, mid[2]], mid, 0.0045, 'cable', { seg: 6 })];
          var bl = madd(mid, Xv, -0.6), br = madd(mid, Xv, 0.6);
          out.push(cyl(bl, br, 0.016, 'chrome', { seg: 12 }));
          out.push(cyl(add(bl, [0, -0.04, 0]), add(bl, [0.12, 0, 0]), 0.016, 'chrome', { seg: 12 }));
          out.push(cyl(add(br, [0, -0.04, 0]), add(br, [-0.12, 0, 0]), 0.016, 'chrome', { seg: 12 }));
          return out;
        },
        contacts: { feet: ['l', 'r'], grips: ['l', 'r'], support: true, flush: 'seat' }
      };
    }
  });

  // ===== 17. Barbell row ====================================================
  clip('bbRow', {
    cam: [62, 12], presets: { front: [0, 10], threeq: [62, 12], side: [90, 4] }, wave: concentricFirst,
    setup: function (rig, B) {
      var legs = plantedLegs(B, { w: B.hipX + 0.03, toeOut: 10 });
      var mf = midfoot(legs, 'l');
      var hinge = 48;
      var sp = { pelvis: { pos: [0, 0.8, mf[2] - 0.2], rot: [hinge, 0, 0] }, neck: [-14, 0, 0], head: [-6, 0, 0], legs: legs, arms: {} };
      // knee bend ~25deg via reach fraction, hips back so shoulders over bar ~ midfoot
      sp.pelvis.pos[1] = legReachPelvisY(rig, sp, 0.955);
      for (var it = 0; it < 4; it++) {
        var fk = trunkFK(rig, sp);
        sp.pelvis.pos[2] += (mf[2] + 0.04) - fk.P.S_l[2];
        sp.pelvis.pos[1] = legReachPelvisY(rig, sp, 0.955);
      }
      var fk2 = trunkFK(rig, sp);
      var ribs = bonePoint(rig, fk2, 'chest', [0, B.chest[1] - 0.04, B.chestFrontZ - 0.01]);
      return { sp: sp, gw: B.shoulderX + 0.08, S: fk2.P.S_l, ribs: ribs };
    },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.sp, { arms: {}, clav: { both: [lerp(-4, 2, p), lerp(12, -14, p)] } });
      var S = c.S;
      var yBot = S[1] - B.reach * 0.975 - B.gD, zBot = S[2] - 0.02;
      var yTop = c.ribs[1] - 0.035, zTop = c.ribs[2] + 0.02;
      var y = lerp(yBot, yTop, p), z = lerp(zBot, zTop, p);
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, G = [s * c.gw, y, z];
        sp.arms[sd] = grip(G, scl(Y, -1), [-s, 0, 0], { pole: [s * 0.72, 0.55, -0.55] });
      });
      return {
        spec: sp,
        props: function (pose) { return barbellProps(lerp3(pose.pts.G_l, pose.pts.G_r, 0.5), Xv, [[0.225, 0.045]]); },
        contacts: { feet: ['l', 'r'], grips: ['l', 'r'] },
        checks: { torsoHinge: { min: 38, max: 58 }, elbowTuck: { atP: 1, min: 25, max: 70, rowing: true } }
      };
    }
  });

  // ===== 18. One-arm DB row (bench supported) =============================
  clip('dbRow', {
    cam: [-56, 16], presets: { front: [0, 12], threeq: [-56, 16], side: [-90, 6] }, wave: concentricFirst,
    setup: function (rig, B) {
      var top = 0.43, kneeR = 0.05;
      var sp = { pelvis: { pos: [0, 0.9, 0], rot: [82, 0, 6] }, spine: [0, -4, 0], chest: [0, -6, 0], neck: [-18, 0, 0], head: [-8, 0, 0], arms: {}, legs: {} };
      // left knee on bench: thigh vertical, shin horizontal back on pad
      sp.legs.l = { mode: 'fk', u: [0.02, -1, -0.02], flexDir: [0, 0, -1], flex: 92, plantar: 68 };
      var fk = trunkFK(rig, sp);
      var Lt = rig.side.l.Lt;
      var kneeY = fk.P.hip_l[1] - Lt;
      sp.pelvis.pos[1] += (top + kneeR) - kneeY;
      fk = trunkFK(rig, sp);
      var Sl = fk.P.S_l;
      var Sr = fk.P.S_r;
      sp.legs.r = { ankle: [fk.P.hip_r[0] - 0.12, B.ankleH, fk.P.hip_r[2] - 0.06], Rfoot: ry(-14 * DEG), heading: nrm([-0.25, 0, 1]), pole: [-0.3, 0.2, 1] };
      ['l', 'r'].forEach(function (sd) { sp.arms[sd] = { mode: 'fk', u: [0, -1, 0], flexDir: Zv, flex: 5, curl: 1 }; });
      var bz0 = fk.P.hip_l[2] - 0.6 * B.Ls, bz1 = fk.P.hip_l[2] + 0.2;
      var pose1 = solve(rig, sp), kl = groupVerts(rig, ['calf_l', 'thigh_l'], 2), kv = skinVerts(rig, pose1, kl), lowK = 1e9;
      for (var i = 0; i < kl.length; i++) if (kv[i * 3 + 2] > bz0 && kv[i * 3 + 2] < bz1) lowK = Math.min(lowK, kv[i * 3 + 1]);
      sp.pelvis.pos[1] += (top - 0.005) - lowK;
      fk = trunkFK(rig, sp); Sl = fk.P.S_l; Sr = fk.P.S_r;
      sp.legs.r.ankle = [fk.P.hip_r[0] - 0.12, B.ankleH, fk.P.hip_r[2] - 0.06];
      return { sp: sp, top: top, Sl: Sl, Sr: Sr, benchZ: fk.P.hip_l[2], bz0: bz0 };
    },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.sp, { arms: {}, chest: [0, lerp(-6, -14, p), 0], clav: { r: [lerp(-6, 4, p), lerp(16, -14, p)], l: [0, 0] } });
      var fk = trunkFK(rig, sp);
      var d = [0.08, 0, 1];
      var palmC = [c.Sl[0] + 0.01, c.top, c.Sl[2] + 0.02];
      sp.arms.l = { mode: 'wrist', W: add(add(palmC, scl(nrm(d), -0.046 * rig.side.l.hs)), [0, 0.031, 0]), d: d, n: [0, -1, 0], curl: -0.22, pole: [0.5, 0.2, -1] };
      var ang = lerp(0, 74, p) * DEG;
      var u = nrm([-0.2, -Math.cos(ang), -Math.sin(ang)]);
      sp.arms.r = { mode: 'fk', u: u, fore: [0.0, -1, 0.04], sup: -8, curl: 1 };
      return {
        spec: sp,
        props: function (pose) { return flatBench(c.bz0, c.bz0 + 1.2, c.top, { x: 0.08 }).concat(dumbbellProps(pose.pts.G_r, pose.pts.t_r)); },
        contacts: { feet: ['r'], support: true, hands: ['l'], flush: 'knee' },
        checks: { forearmVertical: { side: 'r', maxDeg: 8 } }
      };
    }
  });

  // ===== 19. Inverted row ==================================================
  clip('invRow', {
    cam: [58, 14], presets: { front: [0, 12], threeq: [58, 14], side: [90, 6] }, wave: concentricFirst,
    setup: function (rig, B) {
      var barY = 1.0, gw = B.shoulderX + 0.1;
      var Rf = rx(-62 * DEG);
      var feet = {};
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; feet[sd] = placeFoot(B, sd, Rf, 0, s * 0.1, 0.95); });
      function specFor(th) {
        var sp = { pelvis: { pos: [0, 0, 0], rot: [-(90 - th), 0, 0] }, neck: [8, 0, 0], clav: { both: [0, 0] }, arms: {}, legs: {} };
        var ankMid = lerp3(feet.l.ankle, feet.r.ankle, 0.5), dir = [0, Math.sin(th * DEG), -Math.cos(th * DEG)];
        sp.anchor = { point: 'hips', pos: madd(ankMid, dir, B.leg * 0.99) };
        ['l', 'r'].forEach(function (sd) { sp.legs[sd] = { ankle: feet[sd].ankle, toe: feet[sd].toe, up: feet[sd].up, pole: [0, 1, 0] }; });
        return sp;
      }
      var gz = 0.0;
      // bar z: directly above shoulders at bottom position (arms vertical)
      var thBot = bisect(function (th) { var f = trunkFK(rig, specFor(th)); return f.P.S_l[1] - (barY - B.gD - B.reach * 0.97); }, 0, 60);
      gz = trunkFK(rig, specFor(thBot)).P.S_l[2];
      var sternum = [0, B.chest[1] + 0.07, B.chestFrontZ];
      var thTop = bisect(function (th) { var f = trunkFK(rig, specFor(th)); return bonePoint(rig, f, 'chest', sternum)[1] - (barY - 0.06); }, thBot, 70);
      return { specFor: specFor, barY: barY, gw: gw, gz: gz, thBot: thBot, thTop: thTop };
    },
    pose: function (p, rig, B, c) {
      var sp = c.specFor(lerp(c.thBot, c.thTop, p));
      sp.clav = { both: [0, lerp(10, -14, p)] };
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1;
        sp.arms[sd] = grip([s * c.gw, c.barY, c.gz], Y, [-s, 0, 0], { pole: [s * 0.7, -0.6, 0.6] });
      });
      return {
        spec: sp,
        props: [cyl([-0.75, c.barY, c.gz], [0.75, c.barY, c.gz], 0.016, 'chrome', { seg: 14 }), box([-0.75, c.barY / 2, c.gz], [0.08, c.barY + 0.1, 0.08], 'frame'), box([0.75, c.barY / 2, c.gz], [0.08, c.barY + 0.1, 0.08], 'frame'),
          box([-0.75, 0.02, c.gz], [0.12, 0.04, 0.7], 'frame'), box([0.75, 0.02, c.gz], [0.12, 0.04, 0.7], 'frame')],
        contacts: { grips: ['l', 'r'], heels: ['l', 'r'] },
        checks: { plank: { maxSagDeg: 6 } }
      };
    }
  });

  // ===== 20-21. Squats =======================================================
  function squatClip(id, kind) {
    clip(id, {
      cam: [44, 12], presets: { front: [0, 10], threeq: [44, 12], side: [90, 4] },
      setup: function (rig, B) {
        var legs = plantedLegs(B, { w: B.hipX + (kind === 'goblet' ? 0.09 : 0.075), toeOut: kind === 'goblet' ? 22 : 18, kneeOut: 0.06 });
        var mf = lerp3(midfoot(legs, 'l'), midfoot(legs, 'r'), 0.5);
        var aTop = 2, aBot = kind === 'goblet' ? 22 : 34;
        // bar / bell anchored to trunk
        var barRest = [0, B.neck[1] - 0.035, B.backZ - 0.028];
        var bellRest = [0, B.chest[1] + 0.06, B.chestFrontZ + 0.085];
        function specFor(y, a) {
          var sp = { pelvis: { pos: [0, y, 0], rot: [a * 0.75, 0, 0] }, spine: [a * 0.15, 0, 0], chest: [a * 0.1, 0, 0], neck: [-a * 0.75, 0, 0], legs: legs, arms: {}, clav: { both: [kind === 'goblet' ? 0 : 6, kind === 'goblet' ? 4 : -10] } };
          // balance: load over midfoot
          for (var it = 0; it < 3; it++) {
            var f = trunkFK(rig, sp);
            var lp = kind === 'goblet' ? bonePoint(rig, f, 'chest', bellRest) : bonePoint(rig, f, 'chest', barRest);
            sp.pelvis.pos[2] += mf[2] - lp[2];
          }
          return sp;
        }
        var yTop = bisect(function (y) { var sp = specFor(y, aTop), f = trunkFK(rig, sp); return len(sub(legs.l.ankle, f.P.hip_l)) / B.leg - 0.985; }, 0.5, 1.3);
        var yBot = bisect(function (y) {
          var sp = specFor(y, aBot), pose = solve(rig, sp);
          return (pose.pts.hip_l[1] - pose.pts.K_l[1]) + 0.035;
        }, 0.3, yTop);
        return { specFor: specFor, legs: legs, yTop: yTop, yBot: yBot, aTop: aTop, aBot: aBot, barRest: barRest, bellRest: bellRest, mf: mf };
      },
      pose: function (p, rig, B, c) {
        var sp = c.specFor(lerp(c.yTop, c.yBot, p), lerp(c.aTop, c.aBot, p));
        var fk = trunkFK(rig, sp);
        if (kind === 'goblet') {
          var bell = bonePoint(rig, fk, 'chest', c.bellRest);
          ['l', 'r'].forEach(function (sd) {
            var s = sd === 'l' ? 1 : -1;
            var G = add(bell, [s * 0.052, -0.03, -0.012]);
            sp.arms[sd] = grip(G, nrm([-s * 0.55, 0.75, 0.25]), [0, 0.2, 1], { pole: [s * 0.35, -1, 0.1], gN: B.gN + 0.01, curl: 0.8 });
          });
          return {
            spec: sp,
            props: function (pose) { var axis = Y, out = dumbbellProps(add(bell, [0, 0, 0]), axis, 1.15); return out; },
            contacts: { feet: ['l', 'r'] },
            checks: { depth: { atP: 1, hipBelowKnee: 0.0 }, kneesOverToes: true, loadOverMidfoot: { tol: 0.06 } }
          };
        }
        var bar = bonePoint(rig, fk, 'chest', c.barRest);
        var axis = nrm(sub(bonePoint(rig, fk, 'chest', add(c.barRest, Xv)), bar));
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1, G = madd(bar, axis, s * (B.shoulderX + 0.16));
          sp.arms[sd] = grip(G, nrm([0, 1, 0.45]), [-s, 0, 0], { pole: [s * 0.3, -1, -0.5] });
        });
        return {
          spec: sp,
          props: function () { return barbellProps(bar, axis, [[0.225, 0.045], [0.225, 0.045]]); },
          contacts: { feet: ['l', 'r'], grips: ['l', 'r'] },
          checks: { depth: { atP: 1, hipBelowKnee: 0.0 }, kneesOverToes: true, barOverMidfoot: { tol: 0.04 } }
        };
      }
    });
  }
  squatClip('squat', 'back'); squatClip('goblet', 'goblet');

  // ===== 22-23. Hinges: RDL & conventional deadlift ========================
  function hingeClip(id, kind) {
    clip(id, {
      cam: [64, 12], presets: { front: [0, 10], threeq: [64, 12], side: [90, 4] },
      setup: function (rig, B) {
        var legs = plantedLegs(B, { w: B.hipX + 0.015, toeOut: 8, kneeOut: 0.12 });
        var mf = lerp3(midfoot(legs, 'l'), midfoot(legs, 'r'), 0.5);
        var gw = B.hipX + (kind === 'deadlift' ? 0.14 : 0.12);
        var barZ = mf[2] + 0.01;
        var ank = legs.l.ankle;
        // legs by angles (shin lean back +, knee flexion) -> hip centre; trunk angle a -> shoulders
        function specAt(a, kneeF, shinBack) {
          var sh = shinBack * DEG, kf = kneeF * DEG;
          var Kp = [0, ank[1] + Math.cos(sh) * B.Ls, ank[2] - Math.sin(sh) * B.Ls];
          var th = sh + kf; // thigh angle back from vertical
          var Hp = [0, Kp[1] + Math.cos(th) * B.Lt, Kp[2] - Math.sin(th) * B.Lt];
          var sp = { pelvis: { pos: [0, 1, 0], rot: [a, 0, 0] }, neck: [-a * 0.55, 0, 0], head: [-a * 0.1, 0, 0], clav: { both: [lerp(0, -6, a / 60), lerp(0, 8, a / 60)] }, legs: legs, arms: {} };
          sp.anchor = { point: 'hips', pos: [0, Hp[1] - 0.004, Hp[2]] };
          return sp;
        }
        function barFor(sp) {
          var f = trunkFK(rig, sp), S = f.P.S_l;
          var dz = (barZ - B.gN * 0.2) - S[2], dx = gw - S[0];
          var dy = Math.sqrt(Math.max(Math.pow(B.reach * 0.985, 2) - dz * dz - dx * dx, 0.0001));
          return [0, S[1] - dy - B.gD, barZ];
        }
        var plan;
        if (kind === 'rdl') {
          plan = function (p) { return { a: lerp(3, 68, p), k: lerp(6, 24, p), sb: lerp(0, -3, p) }; };
        } else {
          // conventional: bottom = bar on the floor with shins touching it; solve the trunk angle
          var floorY = 0.225;
          var aB = bisect(function (a) {
            var kB = bisect(function (k) { var b = barFor(specAt(a, k, 12)); return b[1] - floorY; }, 5, 120);
            var pose = solve(rig, specAt(a, kB, 12)), K = pose.pts.K_l, A = pose.pts.A_l;
            var t = clamp((floorY - A[1]) / (K[1] - A[1]), 0, 1), shinZ = lerp(A[2], K[2], t);
            return (barZ - shinZ) - 0.05;
          }, 25, 70);
          var kB = bisect(function (k) { var b = barFor(specAt(aB, k, 12)); return b[1] - floorY; }, 5, 120);
          plan = function (p) { var e = Math.pow(p, 1.15); return { a: lerp(2, aB, e), k: lerp(4, kB, p), sb: lerp(0, 12, p) }; };
        }
        return { specAt: specAt, barFor: barFor, plan: plan, gw: gw, barZ: barZ };
      },
      pose: function (p, rig, B, c) {
        var pl = c.plan(p), sp = c.specAt(pl.a, pl.k, pl.sb), bar = c.barFor(sp);
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1, G = [s * c.gw, bar[1], c.barZ];
          sp.arms[sd] = grip(G, scl(Y, -1), [-s, 0, 0], { pole: [s * 0.5, 0.3, -1] });
        });
        return {
          spec: sp,
          props: function () { return barbellProps([0, bar[1], c.barZ], Xv, [[0.225, 0.045], [0.225, 0.04]]); },
          contacts: { feet: ['l', 'r'], grips: ['l', 'r'] },
          checks: { barOverMidfoot: { tol: 0.05 }, neutralSpine: true, hinge: kind === 'rdl' ? { maxKneeFlex: 30 } : null }
        };
      }
    });
  }
  hingeClip('rdl', 'rdl'); hingeClip('deadlift', 'deadlift');

  // ===== 24. Bulgarian split squat ========================================
  clip('bss', {
    cam: [70, 12], presets: { front: [0, 10], threeq: [70, 12], side: [90, 4] },
    setup: function (rig, B) {
      var benchTop = 0.46;
      var front = plantedLegs(B, { w: B.hipX + 0.01, z: 0.34, toeOut: 6 }).l;
      var Rr = rx(150 * DEG);
      var rear = placeFoot(B, 'r', Rr, benchTop, -(B.hipX - 0.01), -0.52);
      rear.Rfoot = Rr;
      function specFor(y, a) {
        var sp = { pelvis: { pos: [0, y, 0.02], rot: [a, 0, 0] }, neck: [-a * 0.6, 0, 0], legs: { l: { ankle: front.ankle, Rfoot: front.Rfoot, heading: front.heading, pole: [0.1, 0, 1] }, r: { ankle: rear.ankle, Rfoot: rear.Rfoot, pole: [0, -0.4, 1] } }, arms: {} };
        return sp;
      }
      var yTop = bisect(function (y) { var f = trunkFK(rig, specFor(y, 6)); return Math.max(len(sub(front.ankle, f.P.hip_l)), len(sub(rear.ankle, f.P.hip_r))) / B.leg - 0.975; }, 0.5, 1.3);
      var yBot = bisect(function (y) { var pose = solve(rig, specFor(y, 14)); return (pose.pts.hip_l[1] - pose.pts.K_l[1]) + 0.012; }, 0.3, yTop);
      return { specFor: specFor, yTop: yTop, yBot: yBot, benchTop: benchTop, rearZ: rear.ankle[2] };
    },
    pose: function (p, rig, B, c) {
      var sp = c.specFor(lerp(c.yTop, c.yBot, p), lerp(6, 14, p));
      ['l', 'r'].forEach(function (sd) { sp.arms[sd] = { mode: 'fk', u: [(sd === 'l' ? 1 : -1) * 0.3, -1, 0.0], flexDir: Zv, flex: 6, sup: 0, curl: 1 }; });
      return {
        spec: sp,
        props: function (pose) {
          var out = flatBench(c.rearZ - 0.5, c.rearZ + 0.035, c.benchTop, { x: -0.05 });
          ['l', 'r'].forEach(function (sd) { out = out.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd])); });
          return out;
        },
        contacts: { feet: ['l'], rearFoot: 'r', support: true },
        checks: { depth: { atP: 1, hipBelowKnee: 0.0, side: 'l' } }
      };
    }
  });

  // ===== 25. Pistol squat ===================================================
  clip('pistol', {
    cam: [68, 12], presets: { front: [0, 10], threeq: [68, 12], side: [90, 4] },
    setup: function (rig, B) {
      var foot = plantedLegs(B, { w: 0.04, z: 0.0, toeOut: 6 }).l;
      var mf = [foot.ankle[0], 0, foot.ankle[2] + 0.07];
      function specFor(y, a) {
        var sp = { pelvis: { pos: [0.0, y, 0], rot: [a, 0, 4] }, neck: [-a * 0.6, 0, 0], legs: { l: { ankle: foot.ankle, Rfoot: foot.Rfoot, pole: [0.15, 0, 1] } }, arms: {} };
        for (var it = 0; it < 4; it++) { var f = trunkFK(rig, sp); var com = lerp3(f.P.hip_l, lerp3(f.P.S_l, f.P.S_r, 0.5), 0.55); sp.pelvis.pos[2] += (mf[2] + 0.02) - com[2]; }
        return sp;
      }
      var yTop = bisect(function (y) { var f = trunkFK(rig, specFor(y, 4)); return len(sub(foot.ankle, f.P.hip_l)) / B.leg - 0.985; }, 0.5, 1.3);
      var yBot = bisect(function (y) { var pose = solve(rig, specFor(y, 42)); return (pose.pts.hip_l[1] - pose.pts.K_l[1]) + 0.06; }, 0.2, yTop);
      return { specFor: specFor, yTop: yTop, yBot: yBot };
    },
    pose: function (p, rig, B, c) {
      var sp = c.specFor(lerp(c.yTop, c.yBot, p), lerp(4, 42, p));
      var hipF = lerp(28, 92, p) * DEG + lerp(4, 42, p) * DEG * 0;
      var fk = trunkFK(rig, sp), hy = fk.P.hip_r[1];
      var need = Math.acos(clamp((hy - 0.13) / (B.leg + 0.04), -1, 1)) / DEG + 6;
      var ang = Math.max(lerp(25, 84, p), need);
      sp.legs.r = { mode: 'fk', u: [-0.06, -Math.cos(ang * DEG), Math.sin(ang * DEG)], flexDir: [0, -1, -0.2], flex: lerp(8, 4, p), plantar: -12 };
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; sp.arms[sd] = { mode: 'fk', u: nrm([s * 0.18, lerp(-0.45, -0.05, p), 1]), flexDir: [0, 1, 0], flex: 8, sup: 0, curl: 0.4 }; });
      return { spec: sp, props: [], contacts: { feet: ['l'], freeFootClear: 'r' }, checks: { depth: { atP: 1, hipBelowKnee: 0.0, side: 'l' } } };
    }
  });

  // ===== 26. Standing calf raise (step) ====================================
  clip('calf', {
    cam: [58, 10], presets: { front: [0, 8], threeq: [58, 10], side: [90, 2] }, wave: concentricFirst,
    setup: function (rig, B) { return { stepH: 0.15, edgeZ: 0.06 }; },
    pose: function (p, rig, B, c) {
      var th = lerp(-16, 28, p);
      var legs = {};
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, Rm = mMul(ry(s * 7 * DEG), rx(th * DEG));
        var bf = ballFoot(rig, B, sd, Rm, c.stepH, s * (B.hipX + 0.02), c.edgeZ + 0.035);
        legs[sd] = { ankle: bf.ankle, Rfoot: Rm, toeFlat: true, pole: [s * 0.1, 0, 1] };
      });
      var sp = { pelvis: { pos: [0, 1, 0], rot: [2, 0, 0] }, legs: legs, arms: {} };
      sp.pelvis.pos[2] = legs.l.ankle[2] + 0.01;
      sp.pelvis.pos[1] = legReachPelvisY(rig, sp, 0.99);
      sp.arms.l = { mode: 'fk', u: [0.24, -1, 0.02], flexDir: Zv, flex: 8, sup: 0, curl: 1 }; sp.arms.r = { mode: 'fk', u: [-0.32, -0.8, 0.5], flexDir: [0.3, 0.6, 0.6], flex: 40, sup: 0, curl: 0.8 };
      return {
        spec: sp,
        props: function (pose) { return plyoBox([0, c.stepH / 2, c.edgeZ + 0.25], [0.7, c.stepH, 0.5]).concat(dumbbellProps(pose.pts.G_l, pose.pts.t_l)).concat([box([-0.62, 0.6, 0.32], [0.05, 1.2, 0.05], 'frame')]); },
        contacts: { balls: ['l', 'r'], support: true, toesOn: c.stepH },
        checks: { heelTravel: { min: 0.06 } }
      };
    }
  });

  // ===== 27-28. Curls ======================================================
  function curlClip(id, kind) {
    clip(id, {
      cam: kind === 'incline' ? [52, 14] : [30, 8], presets: { front: [0, 8], threeq: kind === 'incline' ? [52, 14] : [30, 8], side: [90, 4] }, wave: concentricFirst,
      setup: function (rig, B) {
        if (kind !== 'incline') return { base: standing(rig, B, { legFrac: 0.982, feet: { w: B.hipX + 0.03 } }) };
        var ang = 58;
        var spec = { pelvis: { pos: [0, 0.62, 0.0], rot: [-(90 - ang), 0, 0] }, spine: [-2, 0, 0], neck: [12, 0, 0], arms: {} };
        spec.legs = plantedLegs(B, { w: 0.13, z: 0.52, toeOut: 6 });
        ['l', 'r'].forEach(function (sd) { spec.legs[sd].pole = [sd === 'l' ? 0.1 : -0.1, 1, 0.5]; });
        var seatTop = 0.46;
        ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; spec.arms[sd] = { mode: 'fk', u: [s * (B.female ? 0.52 : 0.36), -1, -0.02], flexDir: Zv, flex: 8, curl: 1 }; });
        var fit = inclineSeat(rig, B, ang, spec, seatTop, 0.125);
        return { base: spec, seatTop: seatTop, zA: fit.zA, seatZ0: fit.seatZ0, seatZ1: fit.seatZ1, ang: ang };
      },
      pose: function (p, rig, B, c) {
        var sp = Object.assign({}, c.base, { arms: {} });
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1;
          var u = kind === 'incline' ? [s * (B.female ? 0.52 : 0.36), -1, -0.02] : [s * 0.2, -1, 0.06];
          sp.arms[sd] = { mode: 'fk', u: u, flexDir: [0, 0, 1], flex: lerp(8, kind === 'incline' ? 128 : 134, p), sup: kind === 'hammer' ? -6 : 84, curl: 1, wflex: lerp(0, 10, p) };
        });
        return {
          spec: sp,
          props: function (pose) {
            var out = [];
            if (kind === 'incline') out = out.concat(inclineBenchProps(c, 0.25));
            ['l', 'r'].forEach(function (sd) { out = out.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd], 0.85)); });
            return out;
          },
          contacts: { feet: ['l', 'r'], support: kind === 'incline', flush: kind === 'incline' ? 'torso' : null },
          checks: { upperArmPinned: { maxDeg: 3 } }
        };
      }
    });
  }
  curlClip('inclineCurl', 'incline'); curlClip('hammerCurl', 'hammer');

  // ===== 29. Triceps pushdown =============================================
  clip('pushdown', {
    cam: [100, 8], presets: { front: [180, 8], threeq: [125, 10], side: [90, 4] }, wave: concentricFirst,
    setup: function (rig, B) { return { base: standing(rig, B, { prot: [12, 0, 0], legFrac: 0.975, feet: { l: { z: 0.04 }, r: { z: -0.06 } } }) }; },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.base, { arms: {}, clav: { both: [-4, 6] } });
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1;
        sp.arms[sd] = { mode: 'fk', u: [s * 0.08, -1, 0.1], flexDir: [s * -0.08, 0, 1], flex: lerp(102, 6, p), sup: lerp(-4, -30, p), curl: 1 };
      });
      var P = [0, 2.0, 0.42];
      return {
        spec: sp,
        props: function (pose) { return cableTower([0, 0, 0.42], 2.0).concat(ropeHandle(pose.pts.G_l, pose.pts.G_r, P)); },
        contacts: { feet: ['l', 'r'] },
        checks: { upperArmPinned: { maxDeg: 3 } }
      };
    }
  });

  // ===== 30-34. Arm-wrestling specialist clips ==============================
  function awTrunk(base, kind, p) {
    var sp = JSON.parse(JSON.stringify(base));
    var yaw = { pron: lerp(-8, -14, p), cup: -10, rise: -10, back: lerp(-10, -2, p), side: lerp(-6, -26, p) }[kind];
    var lean = { pron: 14, cup: 16, rise: 12, back: lerp(16, 2, p), side: lerp(12, 16, p) }[kind];
    sp.pelvis.rot = [lean * 0.7, yaw * 0.5, 0]; sp.spine = [lean * 0.15, yaw * 0.3, 0]; sp.chest = [lean * 0.15, yaw * 0.4, 0];
    sp.clav = { r: [kind === 'back' ? lerp(0, -8, p) : -4, kind === 'back' ? lerp(8, -10, p) : 6], l: [0, 6] };
    return sp;
  }
  function awClip(id, kind) {
    clip(id, {
      cam: [-58, 18], presets: { front: [0, 16], threeq: [-58, 18], side: [-90, 8] }, wave: kind === 'side' || kind === 'back' ? concentricFirst : concentricFirst,
      setup: function (rig, B) {
        var base = standing(rig, B, { feet: { l: { z: 0.06, w: B.hipX + 0.08 }, r: { z: -0.12, w: B.hipX + 0.1 } }, prot: [14, -10, 0], legFrac: 0.97 });
        var sp0 = awTrunk(base, kind, 0);
        var S = trunkFK(rig, sp0).P.S_r;
        var E = madd(S, nrm([0.32, -0.82, 0.48]), rig.side.r.L1);
        var padTop = E[1] - 0.045;
        return { base: base, E: E, padTop: padTop, tableZ: E[2] + 0.33 };
      },
      pose: function (p, rig, B, c) {
        var sp = awTrunk(c.base, kind, p);
        // keep upper-arm length exact with the elbow anchored on the pad: solve pelvis z
        var z0 = c.base.pelvis.pos[2];
        sp.pelvis.pos[2] = rootNear(function (z) { sp.pelvis.pos[2] = z; var f = trunkFK(rig, sp); return len(sub(c.E, f.P.S_r)) - rig.side.r.L1; }, z0, 0.3);
        var fore, sup = 0, wflex = 0, dev = 0, curl = 1;
        if (kind === 'pron') { fore = nrm([0.12, 1, 0.22]); sup = lerp(46, -38, p); wflex = 18; }
        else if (kind === 'cup') { fore = nrm([0.05, 1, 0.45]); sup = 58; wflex = lerp(-34, 62, p); curl = lerp(0.65, 1, p); }
        else if (kind === 'rise') { fore = nrm([0.1, 1, 0.3]); sup = 12; dev = lerp(-14, 30, p); wflex = 10; }
        else if (kind === 'back') { fore = nrm(lerp3([0.05, 1, 0.55], [0.02, 1, -0.05], p)); sup = 30; wflex = 30; }
        else { fore = nrm(lerp3([0.0, 1, 0.3], [0.78, 0.82, 0.3], p)); sup = 20; wflex = 26; }
        sp.arms.r = { mode: 'fk', elbowAt: c.E, fore: fore, sup: sup, wflex: wflex, dev: dev, curl: curl };
        // non-working hand grips the peg
        var peg = [c.E[0] + 0.62, c.padTop + 0.1, c.E[2] + 0.02];
        sp.arms.l = grip(peg, Y, [0, 0, 1], { pole: [0.4, -1, -0.4] });
        return {
          spec: sp,
          props: function (pose) {
            var tz = c.tableZ, ty = c.padTop - 0.03, out = [];
            out.push(box([c.E[0] + 0.28, ty - 0.04, tz], [0.95, 0.06, 0.62], 'awtable', { solid: true }));
            out.push(box([c.E[0], c.padTop - 0.015, c.E[2] + 0.02], [0.2, 0.03, 0.2], 'awpad', { solid: true, support: true }));
            out.push(cyl([peg[0], ty - 0.01, peg[2]], [peg[0], peg[1] + 0.09, peg[2]], 0.017, 'chrome'));
            [[-0.15, -0.25], [0.7, -0.25], [-0.15, 0.25], [0.7, 0.25]].forEach(function (o) { out.push(box([c.E[0] + o[0], (ty - 0.07) / 2, tz + o[1]], [0.05, ty - 0.07, 0.05], 'frame')); });
            var G = pose.pts.G_r;
            if (kind === 'pron' || kind === 'rise') {
              var pin = kind === 'pron' ? [G[0] - 0.42, 0.42, G[2] + 0.05] : [G[0] - 0.05, 0.4, G[2] + 0.25];
              out.push(cyl(G, add(pin, [0, 0.06, 0]), 0.012, 'strap', { seg: 8 }));
              out.push(cyl(add(pin, [0, -0.08, 0]), add(pin, [0, 0.06, 0]), 0.025, 'chrome'));
              out.push(cyl(add(pin, [0, -0.04, 0]), add(pin, [0, 0.0, 0]), 0.15, 'plate', { seg: 24 }));
            } else {
              var pul = kind === 'side' ? [G[0] - 0.85, c.padTop + 0.15, G[2] + 0.1] : (kind === 'back' ? [G[0], c.padTop + 0.15, G[2] + 1.1] : [G[0] - 0.1, c.padTop - 0.1, G[2] + 0.9]);
              out.push(cableLine(pul, G));
              out.push(cyl(add(pul, [0, -0.04, 0]), add(pul, [0, 0.04, 0]), 0.04, 'accent', { seg: 14 }));
              out.push(box([pul[0], pul[1] / 2, pul[2] + (kind === 'side' ? 0 : 0.08)], [0.12, pul[1], 0.12], 'frame'));
              out = out.concat(dHandle(G, pose.pts.t_r));
            }
            return out;
          },
          contacts: { feet: ['l', 'r'], elbowPad: 'r', grips: ['l'] },
          checks: { elbowAnchored: { side: 'r', tol: 0.006 } }
        };
      }
    });
  }
  awClip('awPronation', 'pron'); awClip('awCup', 'cup'); awClip('awRise', 'rise'); awClip('awBack', 'back'); awClip('awSide', 'side');

  // ===== 35. Kettlebell swing ==============================================
  clip('kbSwing', {
    cam: [70, 10], presets: { front: [0, 8], threeq: [70, 10], side: [90, 4] },
    wave: function (u) {
      // ballistic: float (q=0) -> hike (q=1) -> explosive hip snap back to float
      var q, ph;
      if (u < 0.38) { q = ease(u / 0.38); ph = 'ECCENTRIC'; }
      else if (u < 0.44) { q = 1; ph = 'PEAK TENSION'; }
      else if (u < 0.7) { var t = (u - 0.44) / 0.26; q = 1 - (1 - Math.pow(1 - t, 2.2)); ph = 'DRIVE / LOCKOUT'; }
      else { q = 0; ph = 'RESET / BRACE'; }
      return { p: q, phase: ph, q: q };
    },
    setup: function (rig, B) {
      var legs = plantedLegs(B, { w: B.hipX + 0.085, toeOut: 16, kneeOut: 0.2 });
      return { legs: legs, mf: lerp3(midfoot(legs, 'l'), midfoot(legs, 'r'), 0.5) };
    },
    pose: function (p, rig, B, c, u) {
      var w = this.wave(u != null ? u : 0), q = w.q != null ? w.q : p; // q: 1 = hike (bottom), 0 = float (top)
      var a = lerp(-2, 66, q), knee = lerp(0.99, 0.93, q);
      var sp = { pelvis: { pos: [0, 0.9, 0], rot: [a, 0, 0] }, neck: [-a * 0.55, 0, 0], legs: c.legs, arms: {}, clav: { both: [lerp(2, -4, q), lerp(6, 0, q)] } };
      for (var it = 0; it < 4; it++) {
        sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee);
        var f = trunkFK(rig, sp), com = lerp3(lerp3(f.P.hip_l, f.P.hip_r, 0.5), f.P.S_l, 0.45);
        sp.pelvis.pos[2] += (c.mf[2] - 0.02) - com[2];
      }
      sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee);
      var fk = trunkFK(rig, sp), Sm = lerp3(fk.P.S_l, fk.P.S_r, 0.5);
      // arm angle: float -> horizontal; hike -> back between thighs
      var armA = lerp(88, -18 - a * 0.0, q) * DEG; // angle from straight down toward +Z (world)
      var dirArm = [0, -Math.cos(armA), Math.sin(armA)];
      if (q > 0.6) { dirArm = nrm(lerp3(dirArm, [0, -0.55, -0.84], (q - 0.6) / 0.4)); }
      var hand = madd(Sm, dirArm, B.reach * 0.994 + B.gD * 0.96);
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, Sd = fk.P['S_' + sd];
        var W = madd(Sd, nrm(sub(add(hand, [s * 0.04, 0, 0]), Sd)), rig.side[sd].L1 + rig.side[sd].L2 - 0.0003);
        var hf = handFrame(sd, rig, { d: dirArm, t: [-s, 0, 0] });
        sp.arms[sd] = { mode: 'wrist', W: W, d: hf.d, n: hf.n, curl: 1, pole: [s * 0.2, 0, -1] };
      });
      return {
        spec: sp,
        props: function (pose) {
          var mid = lerp3(pose.pts.G_l, pose.pts.G_r, 0.5), dn = nrm(add(pose.pts.d_l, pose.pts.d_r));
          var bell = madd(mid, dn, 0.135);
          return [cyl(add(mid, [-0.075, 0, 0]), add(mid, [0.075, 0, 0]), 0.012, 'plate', { seg: 10 }), cyl(add(mid, [-0.07, 0, 0]), madd(add(mid, [-0.07, 0, 0]), dn, 0.07), 0.011, 'plate', { seg: 8 }), cyl(add(mid, [0.07, 0, 0]), madd(add(mid, [0.07, 0, 0]), dn, 0.07), 0.011, 'plate', { seg: 8 }),
            { t: 'sph', c: bell, r: 0.1, m: 'plate', solid: true }];
        },
        contacts: { feet: ['l', 'r'], grips: ['l', 'r'] },
        checks: { straightArms: { maxElbowFlex: 12 } }
      };
    }
  });

  // ===== 36. Box jump =======================================================
  clip('boxJump', {
    cam: [74, 10], presets: { front: [0, 8], threeq: [74, 10], side: [90, 4] },
    wave: function (u) {
      if (u < 0.18) return { p: u, phase: 'ECCENTRIC' };
      if (u < 0.42) return { p: u, phase: 'DRIVE / LOCKOUT' };
      if (u < 0.55) return { p: u, phase: 'PEAK TENSION' };
      if (u < 0.68) return { p: u, phase: 'DRIVE / LOCKOUT' };
      return { p: u, phase: 'RESET / BRACE' };
    },
    setup: function (rig, B) {
      var boxH = 0.5, boxZ = 0.62, depth = 0.5;
      var floorL = plantedLegs(B, { w: B.hipX + 0.03, toeOut: 8 });
      var boxL = plantedLegs(B, { w: B.hipX + 0.03, toeOut: 8, z: boxZ - 0.06, floor: boxH });
      function stand(legs, y0, a, z0, knee) {
        var sp = { pelvis: { pos: [0, y0, z0], rot: [a, 0, 0] }, neck: [-a * 0.5, 0, 0], legs: legs, arms: {} };
        sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee, y0 - 0.2, y0 + 1.2);
        for (var it = 0; it < 3; it++) { var f = trunkFK(rig, sp), com = lerp3(lerp3(f.P.hip_l, f.P.hip_r, 0.5), f.P.S_l, 0.4); sp.pelvis.pos[2] += (legs.l.ankle[2] + 0.06) - com[2]; sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee, y0 - 0.2, y0 + 1.2); }
        return sp;
      }
      return { boxH: boxH, boxZ: boxZ, depth: depth, floorL: floorL, boxL: boxL, stand: stand };
    },
    pose: function (u, rig, B, c) {
      var K = [
        { t: 0.0, legs: 'floor', a: 2, knee: 0.985, arm: -10 },
        { t: 0.18, legs: 'floor', a: 38, knee: 0.86, arm: -50 },
        { t: 0.28, legs: 'floor', a: 4, knee: 0.995, arm: 150, heel: 30 },
        { t: 0.36, legs: 'air', a: 10, tuck: 0.5, arm: 120 },
        { t: 0.44, legs: 'box', a: 30, knee: 0.88, arm: 40 },
        { t: 0.55, legs: 'box', a: 22, knee: 0.9, arm: 20 },
        { t: 0.68, legs: 'box', a: 2, knee: 0.985, arm: -8 },
        { t: 0.8, legs: 'stepdown', a: 6, knee: 0.97, arm: -8 },
        { t: 1.0, legs: 'floor', a: 2, knee: 0.985, arm: -10 }
      ];
      var i = 0; while (i < K.length - 2 && u > K[i + 1].t) i++;
      var k0 = K[i], k1 = K[i + 1], f = smooth((u - k0.t) / (k1.t - k0.t));
      function build(k) {
        if (k.legs === 'air') return null;
        if (k.legs === 'stepdown') {
          var L = { l: c.boxL.l, r: { ankle: add(c.floorL.r.ankle, [0, 0, 0.02]), Rfoot: c.floorL.r.Rfoot, pole: c.floorL.r.pole } };
          var sd0 = { pelvis: { pos: [0, 1.0, (L.l.ankle[2] + L.r.ankle[2]) / 2 - 0.02], rot: [k.a, 0, 0] }, neck: [-k.a * 0.5, 0, 0], legs: L, arms: {} };
          sd0.pelvis.pos[1] = legReachPelvisY(rig, sd0, 0.96, 0.5, 1.8);
          return sd0;
        }
        var legs = k.legs === 'box' ? c.boxL : c.floorL;
        var sp = c.stand(legs, k.legs === 'box' ? c.boxH + 0.9 : 0.9, k.a, legs.l.ankle[2] - 0.05, k.knee);
        if (k.heel) { sp.legs = Object.assign({}, sp.legs); ['l', 'r'].forEach(function (sd) { var R0 = legs[sd].Rfoot, Rm = mMul(R0, rx(k.heel * DEG)); var rb = sub(rig.T[rig.I['foot_' + sd]], rig.H[rig.I['foot_' + sd]]); var ball = add(legs[sd].ankle, mV(R0, rb)); sp.legs[sd] = { ankle: sub(ball, mV(Rm, rb)), Rfoot: Rm, toeFlat: true, pole: legs[sd].pole }; }); sp.pelvis.pos[1] = legReachPelvisY(rig, sp, 0.995); }
        return sp;
      }
      var A = build(k0), Bk = build(k1), sp;
      var airPos = [0, c.boxH + 0.78, c.boxZ * 0.45];
      if (!A || !Bk) {
        var ground = A || Bk, gp = ground.pelvis.pos, t = A ? f : 1 - f;
        var hip = lerp3(gp, airPos, A ? f : (1 - f));
        sp = { pelvis: { pos: hip, rot: [lerp(ground.pelvis.rot[0], 12, A ? f : 1 - f), 0, 0] }, neck: [-6, 0, 0], legs: {}, arms: {} };
        var tuck = 0.5 * Math.sin(Math.PI * (A ? f : 1 - f) * 0.5 + (A ? 0 : Math.PI / 2));
        ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; sp.legs[sd] = { mode: 'fk', u: nrm([s * 0.03, -1, lerp(0.05, 0.9, tuck + 0.2)]), flexDir: [0, 0, -1], flex: lerp(10, 105, tuck + 0.15), plantar: 22 }; });
      } else {
        sp = { pelvis: { pos: lerp3(A.pelvis.pos, Bk.pelvis.pos, f), rot: [lerp(A.pelvis.rot[0], Bk.pelvis.rot[0], f), 0, 0] }, neck: [lerp(A.neck[0], Bk.neck[0], f), 0, 0], legs: {}, arms: {} };
        ['l', 'r'].forEach(function (sd) {
          var la = A.legs[sd], lb = Bk.legs[sd];
          sp.legs[sd] = { ankle: lerp3(la.ankle, lb.ankle, f), Rfoot: f < 0.5 ? la.Rfoot : lb.Rfoot, toeFlat: la.toeFlat || lb.toeFlat, pole: la.pole };
          if (k0.legs === 'box' && k1.legs === 'stepdown' && sd === 'r') sp.legs.r.ankle[1] += Math.sin(Math.PI * f) * 0.08;
          if (k0.legs === 'stepdown' && k1.legs === 'floor' && sd === 'l') sp.legs.l.ankle[1] += Math.sin(Math.PI * f) * 0.1;
        });
      }
      var arm = lerp(k0.arm, k1.arm, f) * DEG;
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; sp.arms[sd] = { mode: 'fk', u: nrm([s * 0.16, -Math.cos(arm), Math.sin(arm)]), flexDir: [0, 1, 0.3], flex: 20, sup: 0, curl: 0.6 }; });
      var airborne = (k0.legs === 'air' || k1.legs === 'air');
      // ground correction: nothing may sink into the floor or the box top during take-off / landing blends
      var pose0 = solve(rig, sp), lowAll = 1e9;
      ['l', 'r'].forEach(function (sd) {
        var fv = skinVerts(rig, pose0, rig.footList[sd]);
        for (var i = 0; i < fv.length; i += 3) {
          var x = fv[i], y = fv[i + 1], z = fv[i + 2];
          var sup = (Math.abs(x) < 0.35 && z > c.boxZ - 0.1 && z < c.boxZ + c.depth - 0.1) ? c.boxH : 0;
          lowAll = Math.min(lowAll, y - sup);
        }
      });
      if (lowAll < 0) { sp.pelvis.pos[1] -= lowAll; ['l', 'r'].forEach(function (sd) { if (sp.legs[sd].ankle) sp.legs[sd].ankle = add(sp.legs[sd].ankle, [0, -lowAll, 0]); }); }
      return { spec: sp, props: plyoBox([0, c.boxH / 2, c.boxZ + c.depth / 2 - 0.1], [0.7, c.boxH, c.depth]), contacts: airborne ? { airborne: true } : { feet: ['l', 'r'], support: true, dynamic: true } };
    }
  });

  // ===== 37-38. Combat: rotational cable punch & guard shadow burn =========
  function combatClip(id, kind) {
    clip(id, {
      cam: kind === 'punch' ? [58, 8] : [28, 10], presets: { front: [0, 8], threeq: kind === 'punch' ? [58, 8] : [28, 10], side: [90, 4] },
      wave: kind === 'guard' ? function (u) { var h = u < 0.5 ? u * 2 : (u - 0.5) * 2; var pp = h < 0.45 ? ease(h / 0.45) : (h < 0.6 ? 1 : 1 - ease((h - 0.6) / 0.4)); return { p: pp, phase: pp > 0.98 ? 'PEAK TENSION' : (h < 0.45 ? 'DRIVE / LOCKOUT' : 'RESET / BRACE'), arm: u < 0.5 ? 'l' : 'r' }; } : concentricFirst,
      setup: function (rig, B) {
        var legs = plantedLegs(B, { l: { z: 0.2, w: B.hipX + 0.02, toeOut: 18 }, r: { z: -0.22, w: B.hipX + 0.07, toeOut: 38 }, kneeOut: 0.2 });
        return { legs: legs };
      },
      pose: function (p, rig, B, c, u) {
        var w = this.wave(u != null ? u : 0);
        var arm = kind === 'guard' ? w.arm : 'r';
        var rot = kind === 'punch' || arm === 'r' ? p : -p * 0.4;
        var legs = { l: c.legs.l, r: c.legs.r };
        if (rot > 0) {
          // rear-foot pivot: heel lifts and rotates about the ball
          var R0 = c.legs.r.Rfoot, Rm = mMul(ry(-(36 * rot) * DEG), mMul(R0, rx(22 * rot * DEG))), rb = sub(rig.T[rig.I.foot_r], rig.H[rig.I.foot_r]);
          var ball = add(c.legs.r.ankle, mV(R0, rb));
          legs.r = { ankle: sub(ball, mV(Rm, rb)), Rfoot: Rm, toeFlat: true, pole: nrm([-0.4 - 0.4 * rot, 0, 1]) };
        }
        var yaw = lerp(-24, 18, Math.max(rot, 0)) + (rot < 0 ? -10 * rot : 0);
        var sp = { pelvis: { pos: [0, 0.9, 0], rot: [8, yaw * 0.55, 0] }, spine: [4, yaw * 0.2, 0], chest: [4, yaw * 0.35, 0], neck: [-10, -yaw * 0.9, 0], legs: legs, arms: {}, clav: { r: [0, rot > 0 ? 18 * rot : 0], l: [0, arm === 'l' ? 16 * p : 0] } };
        sp.pelvis.pos[1] = legReachPelvisY(rig, sp, 0.955);
        var fk = trunkFK(rig, sp);
        ['l', 'r'].forEach(function (sd) {
          var s = sd === 'l' ? 1 : -1;
          var cheek = bonePoint(rig, fk, 'head', add(B.head, [s * 0.075, 0.05, 0.08]));
          var guardG = add(cheek, [s * 0.015, -0.05, 0.11]);
          var active = (kind === 'punch' && sd === 'r') || (kind === 'guard' && sd === arm);
          var G = guardG, d = nrm([-s * 0.15, 0.8, 0.5]), n = [-s * 0.7, -0.2, 0.6], curl = 1, pole = [s * 0.4, -1, -0.1];
          if (active) {
            var S = fk.P['S_' + sd];
            var tgt = madd(add(S, [-s * (B.shoulderX - 0.03), -0.02, 0]), [0, 0, 1], B.reach * 0.9 + 0.06);
            var e = kind === 'guard' ? p : smooth(seg(p, 0.15, 1));
            G = lerp3(guardG, tgt, e);
            G[1] += Math.sin(Math.PI * e) * 0.03;
            d = nrm(lerp3(d, [0, 0, 1], e)); n = nrm(lerp3(n, [0, -1, 0.0], e));
            pole = nrm(lerp3([s * 0.4, -1, -0.1], [s * 1, -0.3, 0], e));
          }
          sp.arms[sd] = { mode: 'grip', G: G, d: d, n: n, curl: curl, pole: pole, gD: 0.06, gN: 0.015 };
        });
        return {
          spec: sp,
          props: kind === 'punch' ? function (pose) { var P = [-0.3, 1.35, -1.25]; return cableTower([-0.3, 0, -1.25], 1.35).concat([cableLine(P, pose.pts.W_r)]); } :
            function (pose) { var o = []; ['l', 'r'].forEach(function (sd) { o = o.concat(dumbbellProps(pose.pts['G_' + sd], pose.pts['t_' + sd], 0.5)); }); return o; },
          contacts: { frontFoot: 'l', rearBall: 'r' },
          checks: { guardPinned: { side: kind === 'punch' ? 'l' : null } }
        };
      }
    });
  }
  combatClip('punch', 'punch'); combatClip('guard', 'guard');

  // ===== 39. Med-ball slam ===============================================
  clip('slam', {
    cam: [66, 10], presets: { front: [0, 8], threeq: [66, 10], side: [90, 4] },
    setup: function (rig, B) {
      var legs = plantedLegs(B, { w: B.hipX + 0.08, toeOut: 14, kneeOut: 0.22 });
      return { legs: legs, r: 0.14, mf: lerp3(midfoot(legs, 'l'), midfoot(legs, 'r'), 0.5) };
    },
    pose: function (p, rig, B, c) {
      var a = lerp(-8, 58, p), knee = lerp(0.995, 0.86, p);
      var sp = { pelvis: { pos: [0, 0.9, 0], rot: [a, 0, 0] }, spine: [lerp(-6, 8, p), 0, 0], neck: [-a * 0.4, 0, 0], legs: c.legs, arms: {}, clav: { both: [lerp(24, 0, p), lerp(0, 10, p)] } };
      for (var it = 0; it < 3; it++) { sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee); var f = trunkFK(rig, sp), com = lerp3(lerp3(f.P.hip_l, f.P.hip_r, 0.5), f.P.S_l, 0.5); sp.pelvis.pos[2] += (c.mf[2] - 0.03) - com[2]; }
      sp.pelvis.pos[1] = legReachPelvisY(rig, sp, knee);
      var fk = trunkFK(rig, sp), Sm = lerp3(fk.P.S_l, fk.P.S_r, 0.5);
      var ang = lerp(172, 18, p) * DEG; // from overhead to down-forward
      var dir = [0, -Math.cos(ang), Math.sin(ang) * (p > 0.5 ? 1 : 0.35)];
      dir = nrm(dir);
      var ball = madd(Sm, dir, B.reach * 0.9 + c.r * 0.35);
      if (p > 0.95) ball[1] = Math.max(ball[1], c.r);
      ['l', 'r'].forEach(function (sd) {
        var s = sd === 'l' ? 1 : -1, G = add(ball, [s * (c.r + 0.006), 0, 0]);
        sp.arms[sd] = { mode: 'grip', G: G, d: nrm(add(dir, [0, 0, 0])), n: [-s, 0, 0], curl: 0.35, pole: [s * 0.6, -0.4, -0.5], gD: 0.07, gN: 0.022 };
      });
      return { spec: sp, props: [{ t: 'sph', c: ball, r: c.r, m: 'medball', solid: true }], contacts: { feet: ['l', 'r'] } };
    }
  });

  // ===== 40. Forearm hollow plank =======================================
  clip('hollowPlank', {
    cam: [56, 14], presets: { front: [0, 12], threeq: [56, 14], side: [90, 4] }, wave: holdWave,
    setup: function (rig, B) {
      var Rf = rx(70 * DEG), feet = {};
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; feet[sd] = ballFoot(rig, B, sd, Rf, 0, s * 0.1, -0.62); });
      var elbowY = 0.045;
      function specFor(th, tilt) {
        var sp = { pelvis: { pos: [0, 0, 0], rot: [90 - th - tilt, 0, 0] }, spine: [tilt * 0.6, 0, 0], chest: [tilt * 0.3, 0, 0], neck: [-18, 0, 0], clav: { both: [0, 8] }, arms: {}, legs: {} };
        var ankMid = lerp3(feet.l.ankle, feet.r.ankle, 0.5), dir = [0, Math.sin(th * DEG), Math.cos(th * DEG)];
        sp.anchor = { point: 'hips', pos: madd(ankMid, dir, B.leg * 0.99) };
        ['l', 'r'].forEach(function (sd) { sp.legs[sd] = { ankle: feet[sd].ankle, Rfoot: feet[sd].Rfoot, toeFlat: true, pole: [0, -1, 0.3] }; });
        return sp;
      }
      var th0 = bisect(function (th) { var f = trunkFK(rig, specFor(th, 0)); return f.P.S_l[1] - (elbowY + rig.side.l.L1); }, 0, 40);
      var f0 = trunkFK(rig, specFor(th0, 0));
      var E = { l: [f0.P.S_l[0] - 0.01, elbowY, f0.P.S_l[2]], r: [f0.P.S_r[0] + 0.01, elbowY, f0.P.S_r[2]] };
      return { specFor: specFor, th0: th0, E: E };
    },
    pose: function (p, rig, B, c) {
      var tilt = 7 * p, rig_ = rig;
      var th = bisect(function (t) { var f = trunkFK(rig_, c.specFor(t, tilt)); return len(sub(c.E.l, f.P.S_l)) - rig_.side.l.L1; }, c.th0 - 6, c.th0 + 6);
      var sp = c.specFor(th, tilt);
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; sp.arms[sd] = { mode: 'fk', elbowAt: c.E[sd], fore: nrm([-s * 0.22, -0.0, 1]), sup: 30, curl: 0.85, wflex: 6 }; });
      return { spec: sp, props: [box([0, 0.006, c.E.l[2] - 0.55], [0.62, 0.012, 1.85], 'mat')], contacts: { forearms: ['l', 'r'], feetToes: ['l', 'r'] }, checks: { plank: { maxSagDeg: 8 } } };
    }
  });

  // ===== idle (explorer) ===================================================
  clip('idle', {
    cam: [0, 4], presets: { front: [0, 4], threeq: [35, 8], side: [90, 4] }, wave: function (u) { return { p: 0.5 - 0.5 * Math.cos(u * Math.PI * 2), phase: 'IDLE' }; },
    setup: function (rig, B) { return { base: standing(rig, B, { legFrac: 0.99, feet: { w: B.hipX + 0.025, toeOut: 7 } }) }; },
    pose: function (p, rig, B, c) {
      var sp = Object.assign({}, c.base, { chest: [-1.2 * p, 0, 0], clav: { both: [1.2 * p, 0] }, arms: {} });
      ['l', 'r'].forEach(function (sd) { var s = sd === 'l' ? 1 : -1; sp.arms[sd] = { mode: 'fk', u: [s * 0.36, -1, 0.02], flexDir: [0, 0, 1], flex: 14 + 2 * p, sup: 4, curl: 0.35 }; });
      return { spec: sp, props: [], contacts: { feet: ['l', 'r'] } };
    }
  });

  // ------------------------------------------------------------------ exercise -> clip map
  var EXERCISE_CLIPS = {
    barbell_bench: 'bench', db_incline_press: 'inclineDB', pushup_standard: 'pushup', pushup_decline: 'pushupDecline', pushup_diamond: 'pushupDiamond',
    weighted_dip: 'dip', cable_fly: 'cableFly', barbell_ohp: 'ohp', db_shoulder_press: 'dbPress', pike_pushup: 'pike', lateral_raise: 'lateral',
    face_pull: 'facePull', pullup: 'pullup', chinup: 'chinup', lat_pulldown: 'pulldown', barbell_row: 'bbRow', db_row: 'dbRow', inverted_row: 'invRow',
    barbell_squat: 'squat', romanian_deadlift: 'rdl', conventional_deadlift: 'deadlift', bulgarian_split_squat: 'bss', goblet_squat: 'goblet',
    bodyweight_pistol: 'pistol', standing_calf_raise: 'calf', incline_db_curl: 'inclineCurl', hammer_curl: 'hammerCurl', triceps_pushdown: 'pushdown',
    aw_belt_pronation: 'awPronation', aw_rolling_cup: 'awCup', aw_rising_lift: 'awRise', aw_back_pressure: 'awBack', aw_side_pressure: 'awSide',
    aw_fat_grip_hold: 'fatGripHold', kb_swing: 'kbSwing', box_jump: 'boxJump', rotational_punch: 'punch', medball_slam: 'slam',
    guard_shadow_burn: 'guard', hanging_leg_raise: 'legRaise', ab_plank_hollow: 'hollowPlank'
  };
  // legacy kinematics keys (v2 profiles) -> default clip (kept for data compatibility)
  var PROFILES = {
    bench_press: 'bench', incline_press: 'inclineDB', pushup: 'pushup', pushup_decline: 'pushupDecline', pike_pushup: 'pike', dip: 'dip', cable_fly: 'cableFly',
    ohp: 'ohp', lateral_raise: 'lateral', face_pull: 'facePull', pullup: 'pullup', pulldown: 'pulldown', row: 'bbRow', inverted_row: 'invRow', squat: 'squat',
    split_squat: 'bss', rdl: 'rdl', deadlift: 'deadlift', calf_raise: 'calf', curl: 'hammerCurl', triceps_ext: 'pushdown', aw_pronation: 'awPronation',
    aw_cupping: 'awCup', aw_rising: 'awRise', aw_back_pressure: 'awBack', aw_side_pressure: 'awSide', kb_swing: 'kbSwing', box_jump: 'boxJump',
    rotational_punch: 'punch', medball_slam: 'slam', boxing_guard: 'guard', leg_raise: 'legRaise', hollow_plank: 'hollowPlank'
  };
  Object.keys(PROFILES).forEach(function (k) { var c = CLIPS[PROFILES[k]]; PROFILES[k] = { clip: PROFILES[k], cam: c.cam, camPresets: c.presets }; });

  function clipFor(exercise) {
    if (!exercise) return CLIPS.idle;
    var id = EXERCISE_CLIPS[exercise.id] || (PROFILES[exercise.kinematics] && PROFILES[exercise.kinematics].clip) || 'squat';
    return CLIPS[id];
  }

  function evaluate(rig, exercise, u, isIdle) {
    var c = isIdle ? CLIPS.idle : clipFor(exercise);
    if (!rig.cache[c.id]) rig.cache[c.id] = c.setup ? c.setup(rig, rig.B) : {};
    var uu = ((u % 1) + 1) % 1;
    var w = (c.wave || cycleWave)(uu);
    var out = c.pose(c.id === 'boxJump' ? uu : w.p, rig, rig.B, rig.cache[c.id], uu);
    var pose = solve(rig, out.spec);
    var props = typeof out.props === 'function' ? out.props(pose) : (out.props || []);
    return { pose: pose, skin: pose.skin, props: props, phase: w.phase, p: c.id === 'boxJump' ? Math.sin(Math.PI * uu) : w.p, clip: c, contacts: out.contacts || {}, checks: out.checks || {} };
  }

  var api = {
    createRig: createRig, evaluate: evaluate, solve: solve, trunkFK: trunkFK, skinVerts: skinVerts, groupVerts: groupVerts,
    CLIPS: CLIPS, EXERCISE_CLIPS: EXERCISE_CLIPS, PROFILES: PROFILES, clipFor: clipFor, cycleWave: cycleWave,
    math: { add: add, sub: sub, scl: scl, dot: dot, cross: cross, len: len, nrm: nrm, angDeg: angDeg, mV: mV, lerp3: lerp3 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IronPulseKinematics3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
