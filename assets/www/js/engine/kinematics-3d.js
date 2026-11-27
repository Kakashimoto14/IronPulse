(function (root) {
  'use strict';

  var PARENTS = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
  var DEG = Math.PI / 180;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function cycleWave(u) {
    var phase, p;
    if (u < 0.42) {
      phase = 'ECCENTRIC';
      p = easeInOut(u / 0.42);
    } else if (u < 0.55) {
      phase = 'PEAK TENSION';
      p = 1;
    } else if (u < 0.88) {
      phase = 'DRIVE / LOCKOUT';
      p = 1 - easeInOut((u - 0.55) / 0.33);
    } else {
      phase = 'RESET / BRACE';
      p = 0;
    }
    return { p: p, phase: phase };
  }

  // Column-major 4x4 matrix math (WebGL standard)
  function m4Id(out) {
    out[0]=1; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=1; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=1; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
  }

  function m4Mul(out, a, b) {
    var a00=a[0],a01=a[1],a02=a[2],a03=a[3],
        a10=a[4],a11=a[5],a12=a[6],a13=a[7],
        a20=a[8],a21=a[9],a22=a[10],a23=a[11],
        a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for (var col = 0; col < 4; col++) {
      var b0 = b[col*4], b1 = b[col*4+1], b2 = b[col*4+2], b3 = b[col*4+3];
      out[col*4]   = a00*b0 + a10*b1 + a20*b2 + a30*b3;
      out[col*4+1] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
      out[col*4+2] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
      out[col*4+3] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    }
    return out;
  }

  function m4FromTRS(out, tx, ty, tz, rxDeg, ryDeg, rzDeg) {
    var rx = rxDeg * DEG, ry = ryDeg * DEG, rz = rzDeg * DEG;
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cz = Math.cos(rz), sz = Math.sin(rz);
    // Rotation = Ry * Rx * Rz
    out[0]  = cy * cz + sy * sx * sz;
    out[1]  = cx * sz;
    out[2]  = -sy * cz + cy * sx * sz;
    out[3]  = 0;
    out[4]  = -cy * sz + sy * sx * cz;
    out[5]  = cx * cz;
    out[6]  = sy * sz + cy * sx * cz;
    out[7]  = 0;
    out[8]  = sy * cx;
    out[9]  = -sx;
    out[10] = cy * cx;
    out[11] = 0;
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Helper to build symmetric 3D pose dictionary concisely
  // arm: [rx, ry, rz] for RIGHT (+X) side; LEFT (-X) mirrors ry and rz automatically!
  function sym(cfg) {
    var r = {};
    r[0]  = cfg.pelvis || [0, 0, 0];
    r[1]  = cfg.spine  || [0, 0, 0];
    r[2]  = cfg.chest  || [0, 0, 0];
    r[3]  = cfg.neck   || [0, 0, 0];
    r[4]  = cfg.head   || [0, 0, 0];
    var ra = cfg.rArm || cfg.arm || [0, 0, -45];
    var la = cfg.lArm || [ra[0], -ra[1], -ra[2]];
    var re = cfg.rElb || cfg.elb || [0, 0, 0];
    var le = cfg.lElb || [re[0], -re[1], -re[2]];
    var rh = cfg.rHip || cfg.hip || [0, 0, 0];
    var lh = cfg.lHip || [rh[0], -rh[1], -rh[2]];
    var rk = cfg.rKnee || cfg.knee || [0, 0, 0];
    var lk = cfg.lKnee || [rk[0], -rk[1], -rk[2]];
    var rf = cfg.rFoot || cfg.foot || [0, 0, 0];
    var lf = cfg.lFoot || [rf[0], -rf[1], -rf[2]];
    r[5] = la; r[6] = le; r[7] = [0,0,0];
    r[8] = ra; r[9] = re; r[10] = [0,0,0];
    r[11] = lh; r[12] = lk; r[13] = lf;
    r[14] = rh; r[15] = rk; r[16] = rf;
    return { rots: r, pos: cfg.pos || [0, 0, 0] };
  }

  // Natural standing A-pose for 3D Body Explorer (subtle breathing idle)
  var IDLE_START = sym({ arm: [0, 0, -34], elb: [0, -10, 0], chest: [0, 0, 0] });
  var IDLE_PEAK  = sym({ arm: [0, 0, -31], elb: [0, -12, 0], chest: [-1.5, 0, 0] });

  // All 33 Exercise 3D Pose Profiles (camera: [yawDeg, pitchDeg, dist, targetY])
  var PROFILES = {
    bench_press: {
      cam: [54, 18, 3.20, 0.68], camPresets: { front: [132, 22], threeq: [54, 18], side: [90, 12] }, bench: 'flat', ground: false,
      start: sym({ pelvis: [-90,0,0], pos:[0,-0.44,-0.10], arm:[0,-82,10], elb:[0,-8,0], hip:[34,0,0], knee:[58,0,0] }),
      peak:  sym({ pelvis: [-90,0,0], pos:[0,-0.44,-0.10], arm:[0,-22,-4], elb:[0,-86,0], hip:[34,0,0], knee:[58,0,0] })
    },
    incline_press: {
      cam: [48, 16, 3.25, 0.88], camPresets: { front: [128, 20], threeq: [48, 16], side: [90, 12] }, bench: 'incline', ground: false,
      start: sym({ pelvis: [-54,0,0], pos:[0,-0.34,-0.10], arm:[0,-72,46], elb:[0,-12,0], hip:[-12,0,0], knee:[76,0,0] }),
      peak:  sym({ pelvis: [-54,0,0], pos:[0,-0.34,-0.10], arm:[0,-18,16], elb:[0,-86,0], hip:[-12,0,0], knee:[76,0,0] })
    },
    pushup: {
      cam: [48, 16, 2.55, 0.44], ground: false,
      start: sym({ pelvis: [78,0,0], pos:[0,-0.50,0.0], arm:[0,-78,12], elb:[0,-6,0], hip:[4,0,0], knee:[5,0,0] }),
      peak:  sym({ pelvis: [86,0,0], pos:[0,-0.74,0.0], arm:[0,-18,-10], elb:[0,-94,0], hip:[2,0,0], knee:[4,0,0] })
    },
    pushup_decline: {
      cam: [48, 16, 2.6, 0.50], box: 'back', ground: false,
      start: sym({ pelvis: [92,0,0], pos:[0,-0.42,0.0], arm:[0,-82,18], elb:[0,-6,0], hip:[0,0,0], knee:[4,0,0] }),
      peak:  sym({ pelvis: [98,0,0], pos:[0,-0.65,0.0], arm:[0,-20,0], elb:[0,-94,0], hip:[0,0,0], knee:[4,0,0] })
    },
    pike_pushup: {
      cam: [46, 16, 2.55, 0.58], ground: false,
      start: sym({ pelvis: [122,0,0], pos:[0,-0.25,0.0], spine:[14,0,0], arm:[0,-55,75], elb:[0,-10,0], hip:[-82,0,0], knee:[10,0,0] }),
      peak:  sym({ pelvis: [130,0,0], pos:[0,-0.46,0.04], spine:[14,0,0], arm:[0,-22,35], elb:[0,-95,0], hip:[-88,0,0], knee:[14,0,0] })
    },
    dip: {
      cam: [34, 14, 2.55, 0.96], ground: false,
      start: sym({ pelvis: [12,0,0], pos:[0,0.16,0.0], arm:[0,-8,-48], elb:[0,-10,0], hip:[-18,0,0], knee:[65,0,0] }),
      peak:  sym({ pelvis: [22,0,0], pos:[0,-0.08,0.0], arm:[0,28,-22], elb:[0,-96,0], hip:[-22,0,0], knee:[75,0,0] })
    },
    cable_fly: {
      cam: [18, 10, 2.65, 1.02], ground: true,
      start: sym({ spine:[8,0,0], arm:[0,-14,25], elb:[0,-22,0], lHip:[-14,0,0], lKnee:[18,0,0], rHip:[12,0,0], rKnee:[10,0,0] }),
      peak:  sym({ spine:[12,0,0], arm:[0,-84,18], elb:[0,-28,0], lHip:[-14,0,0], lKnee:[18,0,0], rHip:[12,0,0], rKnee:[10,0,0] })
    },
    ohp: {
      cam: [20, 10, 2.75, 1.08], ground: true,
      start: sym({ arm:[0,-32,12], elb:[0,-102,0], knee:[4,0,0] }),
      peak:  sym({ arm:[0,-12,102], elb:[0,-12,0], knee:[2,0,0] })
    },
    lateral_raise: {
      cam: [16, 10, 2.65, 1.02], ground: true,
      start: sym({ spine:[6,0,0], arm:[0,-8,-46], elb:[0,-18,0], knee:[6,0,0] }),
      peak:  sym({ spine:[8,0,0], arm:[0,-18,28], elb:[0,-22,0], knee:[6,0,0] })
    },
    face_pull: {
      cam: [40, 12, 2.6, 1.02], ground: true,
      start: sym({ spine:[6,0,0], arm:[0,-82,25], elb:[0,-14,0], knee:[12,0,0], hip:[-10,0,0] }),
      peak:  sym({ spine:[-6,0,0], arm:[0,-6,32], elb:[0,-108,0], knee:[12,0,0], hip:[-10,0,0] })
    },
    pullup: {
      cam: [18, 10, 2.85, 1.24], ground: false,
      start: sym({ pos:[0,-0.06,0], arm:[0,-10,104], elb:[0,-8,0], knee:[14,0,0] }),
      peak:  sym({ pos:[0,0.32,0], chest:[-8,0,0], arm:[0,-18,16], elb:[0,-112,0], knee:[22,0,0] })
    },
    pulldown: {
      cam: [24, 12, 2.65, 0.96], bench: 'seat', ground: false,
      start: sym({ pos:[0,-0.28,0], spine:[-6,0,0], arm:[0,-14,98], elb:[0,-12,0], hip:[-88,0,0], knee:[88,0,0] }),
      peak:  sym({ pos:[0,-0.28,0], spine:[-14,0,0], arm:[0,-20,12], elb:[0,-108,0], hip:[-88,0,0], knee:[88,0,0] })
    },
    row: {
      cam: [44, 14, 2.6, 0.92], ground: true,
      start: sym({ spine:[24,0,0], chest:[22,0,0], hip:[-26,0,0], knee:[26,0,0], arm:[0,-40,-42], elb:[0,-10,0] }),
      peak:  sym({ spine:[24,0,0], chest:[20,0,0], hip:[-26,0,0], knee:[26,0,0], arm:[0,28,-22], elb:[0,-98,0] })
    },
    inverted_row: {
      cam: [44, 14, 2.6, 0.56], ground: false,
      start: sym({ pelvis:[-72,0,0], pos:[0,-0.52,0], arm:[0,-80,14], elb:[0,-8,0], hip:[6,0,0], knee:[6,0,0] }),
      peak:  sym({ pelvis:[-58,0,0], pos:[0,-0.32,0], arm:[0,18,-10], elb:[0,-102,0], hip:[4,0,0], knee:[6,0,0] })
    },
    squat: {
      cam: [42, 14, 2.65, 0.88], ground: true,
      start: sym({ arm:[0,16,12], elb:[0,-106,0], hip:[-8,0,0], knee:[10,0,0] }),
      peak:  sym({ spine:[14,0,0], chest:[12,0,0], arm:[0,16,12], elb:[0,-106,0], hip:[-92,0,0], knee:[102,0,0] })
    },
    split_squat: {
      cam: [44, 14, 2.65, 0.88], ground: true,
      start: sym({ arm:[0,0,-48], elb:[0,-10,0], lHip:[-18,0,0], lKnee:[20,0,0], rHip:[24,0,0], rKnee:[24,0,0] }),
      peak:  sym({ spine:[10,0,0], arm:[0,0,-48], elb:[0,-10,0], lHip:[-82,0,0], lKnee:[88,0,0], rHip:[20,0,0], rKnee:[96,0,0] })
    },
    rdl: {
      cam: [46, 14, 2.65, 0.90], ground: true,
      start: sym({ arm:[0,-14,-48], elb:[0,-8,0], hip:[-6,0,0], knee:[10,0,0] }),
      peak:  sym({ spine:[34,0,0], chest:[32,0,0], arm:[0,-62,-28], elb:[0,-8,0], hip:[-48,0,0], knee:[18,0,0] })
    },
    deadlift: {
      cam: [46, 14, 2.65, 0.88], ground: true,
      start: sym({ spine:[28,0,0], chest:[24,0,0], arm:[0,-56,-34], elb:[0,-6,0], hip:[-78,0,0], knee:[66,0,0] }),
      peak:  sym({ spine:[2,0,0], chest:[-4,0,0], arm:[0,-10,-48], elb:[0,-6,0], hip:[-4,0,0], knee:[6,0,0] })
    },
    calf_raise: {
      cam: [42, 12, 2.55, 0.86], ground: false,
      start: sym({ pos:[0,0.0,0], arm:[0,0,-48], elb:[0,-12,0], foot:[8,0,0] }),
      peak:  sym({ pos:[0,0.11,0], arm:[0,0,-48], elb:[0,-12,0], foot:[-26,0,0] })
    },
    curl: {
      cam: [32, 10, 2.55, 1.02], ground: true,
      start: sym({ arm:[0,-6,-48], elb:[0,-14,0], knee:[5,0,0] }),
      peak:  sym({ arm:[0,-22,-42], elb:[0,-118,0], knee:[5,0,0] })
    },
    triceps_ext: {
      cam: [38, 12, 2.55, 1.02], ground: true,
      start: sym({ spine:[10,0,0], arm:[0,-14,-44], elb:[0,-112,0], knee:[10,0,0] }),
      peak:  sym({ spine:[10,0,0], arm:[0,-14,-46], elb:[0,-10,0], knee:[10,0,0] })
    },
    // ARM WRESTLING SPECIALIST 3D VECTORS
    aw_pronation: {
      cam: [24, 14, 2.45, 1.06], awTable: true, ground: true,
      start: sym({ spine:[8,12,0], lArm:[0,-10,-48], lElb:[0,-25,0], rArm:[0,-52,-18], rElb:[0,-82,0], knee:[14,0,0] }),
      peak:  sym({ spine:[4,-16,0], lArm:[0,-10,-48], lElb:[0,-25,0], rArm:[0,-72,8], rElb:[0,-118,0], knee:[14,0,0] })
    },
    aw_cupping: {
      cam: [36, 16, 2.45, 1.04], awTable: true, ground: true,
      start: sym({ spine:[14,0,0], lArm:[0,-20,-42], lElb:[0,-45,0], rArm:[0,-68,-12], rElb:[0,-76,0], knee:[16,0,0] }),
      peak:  sym({ spine:[16,-10,0], lArm:[0,-20,-42], lElb:[0,-45,0], rArm:[0,-78,-6], rElb:[0,-108,0], knee:[16,0,0] })
    },
    aw_rising: {
      cam: [36, 12, 2.50, 1.04], ground: true,
      start: sym({ lArm:[0,0,-48], lElb:[0,-15,0], rArm:[0,-30,-40], rElb:[0,-76,0], knee:[8,0,0] }),
      peak:  sym({ lArm:[0,0,-48], lElb:[0,-15,0], rArm:[0,-48,-24], rElb:[0,-112,0], knee:[8,0,0] })
    },
    aw_back_pressure: {
      cam: [40, 14, 2.50, 1.04], awTable: true, ground: true,
      start: sym({ spine:[14,10,0], lArm:[0,-10,-46], lElb:[0,-30,0], rArm:[0,-78,4], rElb:[0,-82,0], knee:[16,0,0] }),
      peak:  sym({ spine:[-12,-14,0], lArm:[0,-10,-46], lElb:[0,-30,0], rArm:[0,-26,-20], rElb:[0,-108,0], knee:[20,0,0] })
    },
    aw_side_pressure: {
      cam: [16, 14, 2.45, 1.06], awTable: true, ground: true,
      start: sym({ spine:[8,18,0], lArm:[0,-10,-46], lElb:[0,-35,0], rArm:[0,-34,-14], rElb:[0,-92,0], knee:[16,0,0] }),
      peak:  sym({ spine:[10,-22,0], lArm:[0,-10,-46], lElb:[0,-35,0], rArm:[0,-98,-8], rElb:[0,-98,0], knee:[18,0,0] })
    },
    // ATHLETIC, COMBAT & CORE
    kb_swing: {
      cam: [46, 12, 2.65, 0.94], ground: true,
      start: sym({ spine:[30,0,0], chest:[24,0,0], arm:[0,-28,-48], elb:[0,-8,0], hip:[-52,0,0], knee:[26,0,0] }),
      peak:  sym({ spine:[-2,0,0], chest:[-4,0,0], arm:[0,-86,28], elb:[0,-6,0], hip:[-4,0,0], knee:[4,0,0] })
    },
    box_jump: {
      cam: [44, 14, 2.70, 1.00], ground: false,
      start: sym({ pos:[0,-0.24,0], spine:[18,0,0], arm:[0,32,-38], elb:[0,-20,0], hip:[-68,0,0], knee:[74,0,0] }),
      peak:  sym({ pos:[0,0.34,0], spine:[4,0,0], arm:[0,-45,88], elb:[0,-18,0], hip:[-45,0,0], knee:[58,0,0] })
    },
    rotational_punch: {
      cam: [24, 12, 2.60, 1.02], ground: true,
      start: sym({ spine:[6,-26,0], chest:[4,-16,0], lArm:[0,-65,-20], lElb:[0,-104,0], rArm:[0,-42,-28], rElb:[0,-112,0], lHip:[-16,0,0], lKnee:[22,0,0], rHip:[14,0,0], rKnee:[14,0,0] }),
      peak:  sym({ spine:[8,28,0], chest:[6,20,0], lArm:[0,-40,-34], lElb:[0,-112,0], rArm:[0,-92,24], rElb:[0,-8,0], lHip:[-18,0,0], lKnee:[24,0,0], rHip:[16,0,0], rKnee:[16,0,0] })
    },
    medball_slam: {
      cam: [44, 14, 2.70, 0.98], ground: true,
      start: sym({ spine:[-6,0,0], arm:[0,-28,102], elb:[0,-16,0], hip:[-4,0,0], knee:[8,0,0] }),
      peak:  sym({ spine:[30,0,0], chest:[24,0,0], arm:[0,-64,-34], elb:[0,-14,0], hip:[-64,0,0], knee:[58,0,0] })
    },
    boxing_guard: {
      cam: [20, 10, 2.55, 1.04], ground: true,
      start: sym({ spine:[6,-14,0], lArm:[0,-66,-22], lElb:[0,-110,0], rArm:[0,-64,-24], rElb:[0,-112,0], knee:[14,0,0] }),
      peak:  sym({ spine:[8,18,0], lArm:[0,-92,22], lElb:[0,-10,0], rArm:[0,-64,-24], rElb:[0,-114,0], knee:[16,0,0] })
    },
    leg_raise: {
      cam: [44, 12, 2.80, 1.15], ground: false,
      start: sym({ pos:[0,0.02,0], arm:[0,-8,104], elb:[0,-6,0], hip:[-4,0,0], knee:[6,0,0] }),
      peak:  sym({ pos:[0,0.02,0], spine:[-14,0,0], arm:[0,-8,104], elb:[0,-6,0], hip:[-102,0,0], knee:[12,0,0] })
    },
    hollow_plank: {
      cam: [48, 16, 2.55, 0.36], ground: false,
      start: sym({ pelvis:[86,0,0], pos:[0,-0.68,0], arm:[0,-72,18], elb:[0,-90,0], hip:[2,0,0], knee:[4,0,0] }),
      peak:  sym({ pelvis:[82,0,0], pos:[0,-0.64,0], spine:[8,0,0], arm:[0,-72,18], elb:[0,-90,0], hip:[-4,0,0], knee:[4,0,0] })
    }
  };

  function computeSkinMatrices(joints, profileName, u, isIdle) {
    var prof = isIdle ? { start: IDLE_START, peak: IDLE_PEAK, cam: [0, 2, 3.72, 0.90], ground: true } : (PROFILES[profileName] || PROFILES.squat);
    var wave = cycleWave(u % 1);
    var p = wave.p;

    var world = new Array(17);
    var local = new Float32Array(16);
    var posX = lerp(prof.start.pos[0], prof.peak.pos[0], p);
    var posY = lerp(prof.start.pos[1], prof.peak.pos[1], p);
    var posZ = lerp(prof.start.pos[2], prof.peak.pos[2], p);

    for (var i = 0; i < 17; i++) {
      var ra = prof.start.rots[i] || [0,0,0];
      var rb = prof.peak.rots[i]  || [0,0,0];
      var rx = lerp(ra[0], rb[0], p);
      var ry = lerp(ra[1], rb[1], p);
      var rz = lerp(ra[2], rb[2], p);

      world[i] = new Float32Array(16);
      var par = PARENTS[i];
      if (par === -1) {
        m4FromTRS(world[i], joints[0][0] + posX, joints[0][1] + posY, joints[0][2] + posZ, rx, ry, rz);
      } else {
        var ox = joints[i][0] - joints[par][0];
        var oy = joints[i][1] - joints[par][1];
        var oz = joints[i][2] - joints[par][2];
        m4FromTRS(local, ox, oy, oz, rx, ry, rz);
        m4Mul(world[i], world[par], local);
      }
    }

    // Automatic floor grounding for standing exercises so sneakers sit solidly on studio floor Y=0
    if (prof.ground) {
      var minFootY = Math.min(world[13][13], world[16][13]) - 0.078;
      for (var k = 0; k < 17; k++) {
        world[k][13] -= minFootY;
      }
    }

    // Compute final 17 GPU skinning matrices: M_skin[i] = M_world[i] * T(-bindJoint[i])
    var flat = new Float32Array(17 * 16);
    var invBind = new Float32Array(16);
    var skin = new Float32Array(16);
    for (var b = 0; b < 17; b++) {
      m4Id(invBind);
      invBind[12] = -joints[b][0];
      invBind[13] = -joints[b][1];
      invBind[14] = -joints[b][2];
      m4Mul(skin, world[b], invBind);
      flat.set(skin, b * 16);
    }

    return {
      bones: flat,
      worldJoints: world,
      p: p,
      phase: wave.phase,
      profile: prof
    };
  }

  var exported = { PROFILES: PROFILES, computeSkinMatrices: computeSkinMatrices, cycleWave: cycleWave };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.IronPulseKinematics3D = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
