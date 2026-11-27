/* IronPulse v3 — studio WebGL renderer (zero dependencies, fully offline).
 * Skinned glTF avatar (23 bones, 4 weights/vertex), per-pixel anatomical muscle map generated from the
 * avatar's region table (anti-aliased borders, fibre shading), key/fill/rim + hemisphere + baked AO,
 * soft contact shadows, materialised gym equipment, auto-framing and 360° orbit / pinch / tap-pick.
 */
(function (root) {
  'use strict';

  var MUSCLE_INDEX = {
    upper_chest: 1, mid_chest: 2, front_delts: 3, side_delts: 4, rear_delts: 5,
    traps: 6, lats: 7, rhomboids: 8, lower_back: 9, biceps: 10, triceps: 11,
    brachioradialis: 12, wrist_flexors: 13, pronators: 14, abs: 15, obliques: 16,
    glutes: 17, quads: 18, hamstrings: 19, calves: 20
  };
  var INDEX_TO_MUSCLE = {};
  Object.keys(MUSCLE_INDEX).forEach(function (k) { INDEX_TO_MUSCLE[MUSCLE_INDEX[k]] = k; });

  var MATERIALS = {
    pad: [[0.085, 0.09, 0.11], 0.05, 18], frame: [[0.27, 0.29, 0.34], 0.55, 40], chrome: [[0.82, 0.85, 0.9], 0.95, 90],
    plate: [[0.065, 0.07, 0.08], 0.12, 14], accent: [[0.957, 0.227, 0.149], 0.3, 40], cable: [[0.78, 0.8, 0.84], 0.7, 60],
    rope: [[0.11, 0.11, 0.12], 0.05, 10], box: [[0.16, 0.17, 0.21], 0.08, 16], awtable: [[0.11, 0.12, 0.15], 0.2, 24],
    awpad: [[0.72, 0.13, 0.11], 0.1, 20], strap: [[0.86, 0.2, 0.16], 0.1, 16], medball: [[0.17, 0.18, 0.21], 0.1, 14],
    mat: [[0.13, 0.15, 0.2], 0.05, 10]
  };

  // ------------------------------------------------------------- matrices
  function m4Perspective(out, fovRad, aspect, near, far) {
    var f = 1.0 / Math.tan(fovRad * 0.5), nf = 1.0 / (near - far);
    out.fill(0); out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  }
  function m4LookAt(out, e, c) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = zz, xy = 0, xz = -zx, xl = Math.hypot(xx, xz) || 1; xx /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0; out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); out[15] = 1;
    return out;
  }
  function m4Mul(out, a, b) {
    var r = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var row = 0; row < 4; row++) r[c * 4 + row] = a[row] * b[c * 4] + a[4 + row] * b[c * 4 + 1] + a[8 + row] * b[c * 4 + 2] + a[12 + row] * b[c * 4 + 3];
    out.set(r); return out;
  }
  function m4Segment(a, b, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-4;
    var ux = dx / L, uy = dy / L, uz = dz / L, rx = 0, ry = 1, rz = 0;
    if (Math.abs(uy) > 0.9) { rx = 1; ry = 0; }
    var tx = ry * uz - rz * uy, ty = rz * ux - rx * uz, tz = rx * uy - ry * ux, tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    var fx = uy * tz - uz * ty, fy = uz * tx - ux * tz, fz = ux * ty - uy * tx;
    return new Float32Array([tx * r, ty * r, tz * r, 0, ux * L, uy * L, uz * L, 0, fx * r, fy * r, fz * r, 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1]);
  }
  function m4Box(c, s, R) {
    if (!R) return new Float32Array([s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, c[0], c[1], c[2], 1]);
    return new Float32Array([R[0] * s[0], R[3] * s[0], R[6] * s[0], 0, R[1] * s[1], R[4] * s[1], R[7] * s[1], 0, R[2] * s[2], R[5] * s[2], R[8] * s[2], 0, c[0], c[1], c[2], 1]);
  }

  // ------------------------------------------------------------- shaders
  var VS_HUMAN = [
    'precision highp float;',
    'attribute vec3 aPos; attribute vec3 aNor; attribute float aAO; attribute vec4 aBones; attribute vec4 aWeights;',
    'uniform mat4 uViewProj; uniform mat4 uBones[27];',
    'varying vec3 vWorldPos; varying vec3 vNormal; varying vec3 vRest; varying float vAO;',
    'void main() {',
    '  vec4 w = aWeights / max(dot(aWeights, vec4(1.0)), 1e-4);',
    '  mat4 m = uBones[int(aBones.x + 0.5)] * w.x + uBones[int(aBones.y + 0.5)] * w.y + uBones[int(aBones.z + 0.5)] * w.z + uBones[int(aBones.w + 0.5)] * w.w;',
    '  vec4 wp = m * vec4(aPos, 1.0);',
    '  vWorldPos = wp.xyz; vNormal = normalize(mat3(m) * aNor); vRest = aPos; vAO = aAO;',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  function buildMuscleGLSL(regions) {
    var lines = ['vec4 classify(vec3 p) {', '  vec3 q = vec3(abs(p.x), p.y, p.z);', '  float b1 = 1e5; float id1 = 0.0; float b2 = 1e5; vec3 L1 = vec3(0.0); vec3 l; float d;'];
    function f(x) { var s = (+x).toFixed(5); return s.indexOf('.') < 0 ? s + '.0' : s; }
    regions.forEach(function (rg) {
      var R = rg.R, c = rg.c, r = rg.r;
      lines.push('  l = vec3(dot(q - vec3(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + '), vec3(' + f(R[0]) + ',' + f(R[1]) + ',' + f(R[2]) + ')), dot(q - vec3(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + '), vec3(' + f(R[3]) + ',' + f(R[4]) + ',' + f(R[5]) + ')), dot(q - vec3(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + '), vec3(' + f(R[6]) + ',' + f(R[7]) + ',' + f(R[8]) + ')));');
      lines.push('  d = ell(l, vec3(' + f(r[0]) + ',' + f(r[1]) + ',' + f(r[2]) + '));');
      lines.push('  if (d < b1) { if (' + f(rg.m) + ' != id1) b2 = b1; b1 = d; id1 = ' + f(rg.m) + '; L1 = l / vec3(' + f(r[0]) + ',' + f(r[1]) + ',' + f(r[2]) + '); } else if (d < b2 && ' + f(rg.m) + ' != id1) { b2 = d; }');
    });
    lines.push('  gFiber = L1; gGap = b2 - b1;');
    lines.push('  return vec4(id1, b1, b2, 0.0);', '}');
    return lines.join('\n');
  }

  function fsHuman(regions, hasDeriv, cloth, female) {
    return [
      hasDeriv ? '#extension GL_OES_standard_derivatives : enable' : '',
      'precision highp float;',
      'varying vec3 vWorldPos; varying vec3 vNormal; varying vec3 vRest; varying float vAO;',
      'uniform vec3 uCamPos; uniform sampler2D uMuscleTex; uniform float uStyle; uniform float uPulse; uniform float uPick; uniform float uLight;',
      'vec3 gFiber; float gGap;',
      'float ell(vec3 l, vec3 r) { float k0 = length(l / r); float k1 = length(l / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }',
      buildMuscleGLSL(regions),
      'float aaw(float x) { ' + (hasDeriv ? 'return max(fwidth(x), 1e-4);' : 'return 0.0015;') + ' }',
      'void main() {',
      '  vec4 cls = classify(vRest);',
      '  float inside = 1.0 - smoothstep(0.0, aaw(cls.y) * 1.5, cls.y);',
      '  float mId = inside > 0.5 ? cls.x : 0.0;',
      '  if (uPick > 0.5) { gl_FragColor = vec4(mId / 255.0, 0.0, 0.0, 1.0); return; }',
      '  vec3 N = normalize(vNormal); vec3 V = normalize(uCamPos - vWorldPos);',
      '  if (dot(N, V) < -0.2) N = -N;',
      '  vec4 md = texture2D(uMuscleTex, vec2((cls.x + 0.5) / 32.0, 0.5));',
      '  float act = md.a * inside;',
      '  // seam between neighbouring muscle bellies (crisp, anti-aliased)',
      '  float seam = 1.0 - smoothstep(0.0, 0.0012 + aaw(gGap) * 1.2, gGap) ;',
      '  float y = vRest.y, ax = abs(vRest.x);',
      '  float shorts = smoothstep(' + cloth.shortBot.toFixed(4) + ' - 0.003, ' + cloth.shortBot.toFixed(4) + ' + 0.003, y) * (1.0 - smoothstep(' + cloth.shortTop.toFixed(4) + ' - 0.003, ' + cloth.shortTop.toFixed(4) + ' + 0.003, y)) * (1.0 - step(0.265, ax));',
      '  float band = shorts * smoothstep(' + (cloth.shortTop - 0.028).toFixed(4) + ', ' + (cloth.shortTop - 0.024).toFixed(4) + ', y);',
      '  float bra = ' + (female ? '1.0' : '0.0') + ' * smoothstep(' + cloth.braBot.toFixed(4) + ' - 0.003, ' + cloth.braBot.toFixed(4) + ' + 0.003, y) * (1.0 - smoothstep(' + cloth.braTop.toFixed(4) + ' - 0.003, ' + cloth.braTop.toFixed(4) + ' + 0.003, y)) * (1.0 - step(0.155, ax));',
      '  float shoe = 1.0 - smoothstep(' + (cloth.shoeTop - 0.004).toFixed(4) + ', ' + (cloth.shoeTop + 0.002).toFixed(4) + ', y);',
      '  float sole = 1.0 - smoothstep(0.022, 0.027, y);',
      '  float hair = ' + (female ? '1.0' : '0.0') + ' * smoothstep(' + (cloth.headTop - 0.115).toFixed(4) + ', ' + (cloth.headTop - 0.1).toFixed(4) + ', y + max(0.0, -vRest.z) * 0.9) * (1.0 - smoothstep(0.03, 0.05, vRest.z + (y - ' + (cloth.headTop - 0.05).toFixed(4) + ') * -0.6));',
      '  hair = max(hair, ' + (female ? '1.0' : '0.0') + ' * step(vRest.z, -0.095) * step(' + (cloth.headTop - 0.3).toFixed(4) + ', y));',
      '  vec3 base; float spec = 0.22; float shin = 28.0; float sss = 0.0;',
      '  if (uStyle < 0.5) {',
      '    base = vec3(0.80, 0.815, 0.85);',
      '    base = mix(base, vec3(0.13, 0.145, 0.18), shorts * (1.0 - act * 0.8));',
      '    base = mix(base, vec3(0.2, 0.22, 0.27), band * (1.0 - act));',
      '    base = mix(base, vec3(0.13, 0.145, 0.18), bra * (1.0 - act * 0.8));',
      '    base = mix(base, vec3(0.16, 0.175, 0.21), shoe); base = mix(base, vec3(0.55, 0.57, 0.62), sole * shoe);',
      '    base = mix(base, vec3(0.32, 0.34, 0.39), hair);',
      '    spec = 0.32; shin = 34.0;',
      '  } else {',
      '    base = vec3(0.80, 0.585, 0.46);',
      '    base = mix(base, vec3(0.07, 0.075, 0.095), shorts * (1.0 - act * 0.7));',
      '    base = mix(base, vec3(0.957, 0.227, 0.149), band * (1.0 - act));',
      '    base = mix(base, vec3(0.075, 0.08, 0.1), bra * (1.0 - act * 0.7));',
      '    base = mix(base, vec3(0.1, 0.11, 0.14), shoe); base = mix(base, vec3(0.62, 0.63, 0.66), sole * shoe);',
      '    base = mix(base, vec3(0.1, 0.075, 0.06), hair);',
      '    spec = 0.2; shin = 22.0; sss = 1.0 - max(max(shorts, bra), max(shoe, hair));',
      '  }',
      '  float fiber = 0.9 + 0.1 * sin((gFiber.y * 0.9 + gFiber.z * 0.6) * 46.0 + gFiber.x * 3.0);',
      '  vec3 albedo = mix(base, md.rgb * fiber, act * 0.92);',
      '  albedo *= 1.0 - seam * 0.22 * (0.35 + act);',
      '  // studio lighting: key / fill / rim / hemisphere + baked AO',
      '  vec3 Lk = normalize(vec3(0.55, 0.85, 0.75)); vec3 Lf = normalize(vec3(-0.85, 0.25, 0.35)); vec3 Lr = normalize(vec3(-0.2, 0.55, -1.0));',
      '  float nk = dot(N, Lk); float dk = max(nk, 0.0); float wk = max((nk + 0.35) / 1.35, 0.0);',
      '  float df = max(dot(N, Lf), 0.0); float hemi = 0.5 + 0.5 * N.y;',
      '  float ao = mix(0.35, 1.0, vAO); ao = ao * ao;',
      '  vec3 H = normalize(Lk + V); float sp = pow(max(dot(N, H), 0.0), shin) * spec;',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  float rim = pow(max(dot(N, Lr), 0.0), 2.0) * (0.35 + 0.65 * fres);',
      '  vec3 amb = mix(vec3(0.16, 0.17, 0.2), vec3(0.36, 0.38, 0.43), hemi) * mix(1.0, 1.25, uLight);',
      '  vec3 lit = amb * ao + vec3(1.0, 0.95, 0.9) * mix(dk, wk, 0.25 + 0.3 * sss) * mix(0.55, 1.0, ao) * 1.05 + vec3(0.42, 0.5, 0.66) * df * 0.45 * ao;',
      '  lit += vec3(0.6, 0.18, 0.1) * sss * 0.08 * (1.0 - dk);',
      '  vec3 col = albedo * lit + vec3(1.0, 0.97, 0.94) * sp * ao + vec3(0.7, 0.8, 1.0) * rim * 0.45 * ao;',
      '  col += md.rgb * act * (0.08 + 0.12 * uPulse);',
      '  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);',
      '  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.92)), 1.0);',
      '}'
    ].join('\n');
  }

  var VS_PROP = 'precision highp float; attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uViewProj; uniform mat4 uModel; varying vec3 vW; varying vec3 vN;' +
    'void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel) * aNor; gl_Position = uViewProj * w; }';
  var FS_PROP = 'precision mediump float; varying vec3 vW; varying vec3 vN; uniform vec3 uCamPos; uniform vec3 uColor; uniform float uMetal; uniform float uShin; uniform float uLight;' +
    'void main(){ vec3 N = normalize(vN); vec3 V = normalize(uCamPos - vW); if (dot(N,V) < 0.0) N = -N;' +
    ' vec3 Lk = normalize(vec3(0.55,0.85,0.75)); vec3 Lf = normalize(vec3(-0.85,0.25,0.35)); vec3 Lr = normalize(vec3(-0.2,0.55,-1.0));' +
    ' float dk = max(dot(N,Lk),0.0); float df = max(dot(N,Lf),0.0); float hemi = 0.5+0.5*N.y;' +
    ' vec3 H = normalize(Lk+V); float sp = pow(max(dot(N,H),0.0), uShin) * mix(0.12, 1.1, uMetal);' +
    ' float env = mix(0.0, 0.35, uMetal) * (0.5 + 0.5 * reflect(-V, N).y);' +
    ' float rim = pow(1.0 - max(dot(N,V),0.0), 3.0) * 0.25;' +
    ' vec3 c = uColor * (mix(vec3(0.16,0.17,0.2), vec3(0.34,0.36,0.41), hemi) * mix(1.0,1.3,uLight) + vec3(1.0,0.95,0.9)*dk*0.95 + vec3(0.42,0.5,0.66)*df*0.4) + vec3(1.0,0.98,0.95)*(sp+env) + vec3(0.7,0.8,1.0)*rim*0.6;' +
    ' c = c*(2.51*c+0.03)/(c*(2.43*c+0.59)+0.14); gl_FragColor = vec4(pow(clamp(c,0.0,1.0), vec3(0.92)), 1.0); }';

  var VS_FLOOR = 'precision highp float; attribute vec3 aPos; uniform mat4 uViewProj; uniform vec3 uCenter; uniform float uRad; varying vec2 vXZ;' +
    'void main(){ vec3 p = vec3(aPos.x * uRad + uCenter.x, 0.0, aPos.z * uRad + uCenter.z); vXZ = p.xz; gl_Position = uViewProj * vec4(p,1.0); }';
  var FS_FLOOR = 'precision highp float; varying vec2 vXZ; uniform vec3 uCenter; uniform float uRad; uniform vec4 uSh[12]; uniform float uLight;' +
    'void main(){ float r = length(vXZ - uCenter.xz) / uRad; if (r > 1.0) discard;' +
    ' float sh = 0.0; for (int i = 0; i < 12; i++) { vec4 s = uSh[i]; if (s.z <= 0.0) continue; float d = length(vXZ - s.xy) / s.z; sh += s.w * exp(-d*d*2.2); }' +
    ' sh = clamp(sh, 0.0, 0.85);' +
    ' vec3 base = mix(vec3(0.115,0.13,0.165), vec3(0.62,0.66,0.72), uLight);' +
    ' float ring = smoothstep(0.985, 0.97, r) * smoothstep(0.93, 0.95, r);' +
    ' vec3 c = base * (1.0 - 0.35 * r * r) * (1.0 - sh) + vec3(0.957,0.227,0.149) * ring * 0.12;' +
    ' float a = smoothstep(1.0, 0.88, r); gl_FragColor = vec4(c, a); }';

  function compile(gl, vs, fs) {
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { if (root.console) console.warn(gl.getShaderInfoLog(o)); return null; } return o; }
    var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }

  function geom(gl, pos, nor, idx) {
    function b(t, a) { var o = gl.createBuffer(); gl.bindBuffer(t, o); gl.bufferData(t, a, gl.STATIC_DRAW); return o; }
    return { p: b(gl.ARRAY_BUFFER, new Float32Array(pos)), n: b(gl.ARRAY_BUFFER, new Float32Array(nor)), i: b(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx)), count: idx.length };
  }
  function boxGeom(gl) {
    var F = [[[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [[1, 0, 0], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
      [[-1, 0, 0], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[0, 1, 0], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[0, -1, 0], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]];
    var p = [], n = [], i = [];
    F.forEach(function (f, k) { for (var j = 1; j <= 4; j++) { p.push(f[j][0] * 0.5, f[j][1] * 0.5, f[j][2] * 0.5); n.push(f[0][0], f[0][1], f[0][2]); } var b = k * 4; i.push(b, b + 1, b + 2, b, b + 2, b + 3); });
    return geom(gl, p, n, i);
  }
  function cylGeom(gl, segs) {
    var p = [], n = [], i = [];
    for (var k = 0; k <= segs; k++) { var a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); p.push(c, -0.5, s, c, 0.5, s); n.push(c, 0, s, c, 0, s); }
    for (var j = 0; j < segs; j++) { var b = j * 2; i.push(b, b + 1, b + 3, b, b + 3, b + 2); }
    [0.5, -0.5].forEach(function (yy) {
      var c0 = p.length / 3; p.push(0, yy, 0); n.push(0, Math.sign(yy), 0);
      for (var t = 0; t <= segs; t++) { var a = t / segs * Math.PI * 2; p.push(Math.cos(a), yy, Math.sin(a)); n.push(0, Math.sign(yy), 0); if (t) { if (yy > 0) i.push(c0, c0 + t, c0 + t + 1); else i.push(c0, c0 + t + 1, c0 + t); } }
    });
    return geom(gl, p, n, i);
  }
  function sphGeom(gl) {
    var p = [], n = [], i = [], R = 14, S = 22;
    for (var r = 0; r <= R; r++) for (var s = 0; s <= S; s++) {
      var th = r / R * Math.PI, ph = s / S * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      p.push(x, y, z); n.push(x, y, z);
    }
    for (var a = 0; a < R; a++) for (var b = 0; b < S; b++) { var q = a * (S + 1) + b; i.push(q, q + S + 1, q + 1, q + 1, q + S + 1, q + S + 2); }
    return geom(gl, p, n, i);
  }
  function discGeom(gl) {
    var p = [0, 0, 0], i = [], S = 64;
    for (var k = 0; k <= S; k++) { var a = k / S * Math.PI * 2; p.push(Math.cos(a), 0, Math.sin(a)); if (k) i.push(0, k, k + 1); }
    return geom(gl, p, p.map(function () { return 0; }), i);
  }

  var globalStyle = 'sculpt', globalBackdrop = 'dark';
  function setGlobalStyle(st) { globalStyle = st === 'athlete' ? 'athlete' : 'sculpt'; }
  function getGlobalStyle() { return globalStyle; }
  function setGlobalBackdrop(b) { globalBackdrop = b === 'light' ? 'light' : 'dark'; }
  function getGlobalBackdrop() { return globalBackdrop; }

  var RIGS = {};
  function getRig(sex) {
    var k = sex === 'female' ? 'female' : 'male';
    if (RIGS[k]) return RIGS[k];
    var av = root.IronPulseGLTF && root.IronPulseGLTF.getAvatar(k);
    if (!av) return null;
    RIGS[k] = root.IronPulseKinematics3D.createRig(av);
    return RIGS[k];
  }

  function create3DScene(canvas, options) {
    options = options || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: !!options.preserve, premultipliedAlpha: true });
    if (!gl || !root.IronPulseKinematics3D || !root.IronPulseGLTF) return null;
    var hasDeriv = !!gl.getExtension('OES_standard_derivatives');
    var progProp = compile(gl, VS_PROP, FS_PROP), progFloor = compile(gl, VS_FLOOR, FS_FLOOR);
    if (!progProp || !progFloor) return null;
    var G = { box: boxGeom(gl), cyl: cylGeom(gl, 18), cyl6: cylGeom(gl, 6), cyl10: cylGeom(gl, 10), cyl28: cylGeom(gl, 28), sph: sphGeom(gl), disc: discGeom(gl) };
    var muscleTexData = new Uint8Array(32 * 4), muscleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, muscleTex);
    ['TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER'].forEach(function (k) { gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.NEAREST); });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, muscleTexData);

    var humans = {};
    function getHuman(sex) {
      var k = sex === 'female' ? 'female' : 'male';
      if (humans[k]) return humans[k];
      var rig = getRig(k);
      if (!rig) return null;
      var av = rig.av, meta = av.meta || {};
      var cloth = Object.assign({ shortTop: 0.99, shortBot: 0.73, braTop: 1.3, braBot: 1.18, shoeTop: 0.1 }, meta.clothing || {});
      cloth.headTop = meta.height || 1.8;
      var prog = compile(gl, VS_HUMAN, fsHuman(meta.regions || [], hasDeriv, cloth, k === 'female'));
      if (!prog) return null;
      function buf(a) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b; }
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, av.idx, gl.STATIC_DRAW);
      var loc = {};
      ['aPos', 'aNor', 'aAO', 'aBones', 'aWeights'].forEach(function (n) { loc[n] = gl.getAttribLocation(prog, n); });
      ['uViewProj', 'uCamPos', 'uMuscleTex', 'uStyle', 'uPulse', 'uPick', 'uLight'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
      loc.uBones = gl.getUniformLocation(prog, 'uBones[0]');
      humans[k] = { rig: rig, prog: prog, loc: loc, pos: buf(av.pos), nor: buf(av.nor), ao: buf(av.ao), bones: buf(av.bones), weights: buf(av.weights), idx: ib, count: av.idx.length, idxType: av.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
      if (humans[k].idxType === gl.UNSIGNED_INT) gl.getExtension('OES_element_index_uint');
      return humans[k];
    }

    var pLoc = {}, fLoc = {};
    ['aPos', 'aNor'].forEach(function (n) { pLoc[n] = gl.getAttribLocation(progProp, n); });
    ['uViewProj', 'uModel', 'uCamPos', 'uColor', 'uMetal', 'uShin', 'uLight'].forEach(function (n) { pLoc[n] = gl.getUniformLocation(progProp, n); });
    fLoc.aPos = gl.getAttribLocation(progFloor, 'aPos');
    ['uViewProj', 'uCenter', 'uRad', 'uLight'].forEach(function (n) { fLoc[n] = gl.getUniformLocation(progFloor, n); });
    fLoc.uSh = gl.getUniformLocation(progFloor, 'uSh[0]');

    var mode = options.mode || 'exercise';
    var camYaw = options.initialYaw != null ? options.initialYaw : (mode === 'explorer' ? 0 : 42);
    var camPitch = options.initialPitch != null ? options.initialPitch : (mode === 'explorer' ? 3 : 12);
    var zoom = 1.0, userDragged = false, dragging = false, pinchDist = 0;
    var downX = 0, downY = 0, lastX = 0, lastY = 0, moved = 0;
    var framing = null, framingKey = '';

    function onDown(e) {
      if (e.touches && e.touches.length === 2) { dragging = false; pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); return; }
      var pt = e.touches ? e.touches[0] : e;
      dragging = true; pinchDist = 0; downX = lastX = pt.clientX; downY = lastY = pt.clientY; moved = 0;
    }
    function onMove(e) {
      if (e.touches && e.touches.length === 2) {
        var nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist > 0) { zoom = Math.max(0.45, Math.min(1.6, zoom * (pinchDist / Math.max(nd, 1)))); userDragged = true; }
        pinchDist = nd; if (e.cancelable) e.preventDefault(); return;
      }
      if (!dragging) return;
      var pt = e.touches ? e.touches[0] : e, dx = pt.clientX - lastX, dy = pt.clientY - lastY;
      lastX = pt.clientX; lastY = pt.clientY; moved += Math.hypot(dx, dy);
      if (moved > 4) { userDragged = true; camYaw -= dx * 0.5; camPitch = Math.max(-12, Math.min(55, camPitch + dy * 0.3)); if (e.cancelable) e.preventDefault(); }
    }
    function onUp() {
      pinchDist = 0;
      if (!dragging) return;
      dragging = false;
      if (moved < 8 && options.onPickMuscle) {
        var rect = canvas.getBoundingClientRect();
        var picked = pickAt((downX - rect.left) / rect.width, 1 - (downY - rect.top) / rect.height);
        if (picked) options.onPickMuscle(picked);
      }
    }
    function onWheel(e) { zoom = Math.max(0.45, Math.min(1.6, zoom * (e.deltaY > 0 ? 1.08 : 0.92))); userDragged = true; e.preventDefault(); }
    canvas.addEventListener('mousedown', onDown); root.addEventListener('mousemove', onMove); root.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onDown, { passive: true }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp, { passive: true });

    var viewProj = new Float32Array(16), camPos = [0, 1, 4], latestCfg = null, lastEval = null;

    function updateMuscleTexture(cfg, pulse) {
      muscleTexData.fill(0);
      function set(id, r, g, b, a) { if (!id) return; muscleTexData[id * 4] = r; muscleTexData[id * 4 + 1] = g; muscleTexData[id * 4 + 2] = b; muscleTexData[id * 4 + 3] = a; }
      if (mode === 'explorer') {
        var fat = cfg.fatigueMap || {}, sel = cfg.selectedMuscle || 'all';
        Object.keys(MUSCLE_INDEX).forEach(function (m) {
          var v = Number(fat[m]) || 0, id = MUSCLE_INDEX[m];
          if (sel === m) set(id, 244, 58, 38, 250);
          else if (v >= 65) set(id, 235, 42, 38, 230);
          else if (v >= 30) set(id, 240, 140, 22, 205);
          else if (v > 0) set(id, 16, 185, 129, 170);
        });
      } else if (cfg.exercise) {
        var ex = cfg.exercise;
        (ex.stabilizers || []).forEach(function (m) { set(MUSCLE_INDEX[m], 95, 183, 196, 120); });
        (ex.secondary || []).forEach(function (m) { set(MUSCLE_INDEX[m], 79, 107, 255, 215); });
        (ex.primary || []).forEach(function (m) { set(MUSCLE_INDEX[m], 244, 58, 38, Math.round(225 + pulse * 30)); });
      }
      gl.bindTexture(gl.TEXTURE_2D, muscleTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RGBA, gl.UNSIGNED_BYTE, muscleTexData);
    }

    function drawProp(g, M, mat) {
      var m = MATERIALS[mat] || MATERIALS.frame;
      gl.uniformMatrix4fv(pLoc.uModel, false, M);
      gl.uniform3fv(pLoc.uColor, m[0]); gl.uniform1f(pLoc.uMetal, m[1]); gl.uniform1f(pLoc.uShin, m[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.p); gl.enableVertexAttribArray(pLoc.aPos); gl.vertexAttribPointer(pLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.n); gl.enableVertexAttribArray(pLoc.aNor); gl.vertexAttribPointer(pLoc.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.i); gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
    }
    function drawProps(props) {
      gl.useProgram(progProp);
      gl.uniformMatrix4fv(pLoc.uViewProj, false, viewProj); gl.uniform3fv(pLoc.uCamPos, camPos); gl.uniform1f(pLoc.uLight, globalBackdrop === 'light' ? 1 : 0);
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.t === 'box') drawProp(G.box, m4Box(p.c, p.s, p.R), p.m);
        else if (p.t === 'cyl') drawProp(p.seg === 6 ? G.cyl6 : p.seg && p.seg <= 10 ? G.cyl10 : p.seg >= 24 ? G.cyl28 : G.cyl, m4Segment(p.a, p.b, p.r), p.m);
        else if (p.t === 'sph') drawProp(G.sph, m4Box(p.c, [p.r, p.r, p.r]), p.m);
      }
    }
    function drawFloor(center, rad, ev) {
      gl.useProgram(progFloor);
      gl.uniformMatrix4fv(fLoc.uViewProj, false, viewProj); gl.uniform3fv(fLoc.uCenter, center); gl.uniform1f(fLoc.uRad, rad);
      gl.uniform1f(fLoc.uLight, globalBackdrop === 'light' ? 1 : 0);
      var sh = new Float32Array(48), k = 0, P = ev.pose.pts;
      function add(pt, r, s) { if (!pt || k >= 12) return; var h = Math.max(pt[1], 0); sh[k * 4] = pt[0]; sh[k * 4 + 1] = pt[2]; sh[k * 4 + 2] = r + h * 0.35; sh[k * 4 + 3] = s * Math.exp(-h * 1.4); k++; }
      add(P.ball_l, 0.11, 0.55); add(P.ball_r, 0.11, 0.55); add(P.A_l, 0.1, 0.5); add(P.A_r, 0.1, 0.5);
      add(P.hip_l ? [(P.hip_l[0] + P.hip_r[0]) / 2, P.hip_l[1], (P.hip_l[2] + P.hip_r[2]) / 2] : null, 0.22, 0.42);
      add(P.S_mid, 0.24, 0.32); add(P.W_l, 0.07, 0.35); add(P.W_r, 0.07, 0.35); add(P.K_l, 0.09, 0.35); add(P.K_r, 0.09, 0.35);
      gl.uniform4fv(fLoc.uSh, sh);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.disc.p); gl.enableVertexAttribArray(fLoc.aPos); gl.vertexAttribPointer(fLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.disc.i);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, G.disc.count, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    function drawHuman(h, ev, pulse, pick) {
      var L = h.loc;
      gl.useProgram(h.prog);
      gl.uniformMatrix4fv(L.uViewProj, false, viewProj); gl.uniformMatrix4fv(L.uBones, false, ev.skin);
      gl.uniform3fv(L.uCamPos, camPos); gl.uniform1f(L.uStyle, globalStyle === 'athlete' ? 1 : 0);
      gl.uniform1f(L.uPulse, pulse); gl.uniform1f(L.uPick, pick ? 1 : 0); gl.uniform1f(L.uLight, globalBackdrop === 'light' ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, muscleTex); gl.uniform1i(L.uMuscleTex, 0);
      function at(loc, b, n) { if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); }
      at(L.aPos, h.pos, 3); at(L.aNor, h.nor, 3); at(L.aAO, h.ao, 1); at(L.aBones, h.bones, 4); at(L.aWeights, h.weights, 4);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, h.idx);
      gl.drawElements(gl.TRIANGLES, h.count, h.idxType, 0);
      [L.aAO, L.aBones, L.aWeights].forEach(function (l) { if (l >= 0) gl.disableVertexAttribArray(l); });
    }

    // auto-framing: bounds over a whole rep (head-to-toe + equipment), so the camera never crops
    function computeFraming(h, cfg) {
      var K = root.IronPulseKinematics3D, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      function addP(p, pad) { if (!p) return; for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i] - (pad || 0)); mx[i] = Math.max(mx[i], p[i] + (pad || 0)); } }
      for (var s = 0; s < 10; s++) {
        var ev = K.evaluate(h.rig, cfg.exercise, s / 10, mode === 'explorer');
        var P = ev.pose.pts;
        ['S_l', 'S_r', 'E_l', 'E_r', 'W_l', 'W_r', 'G_l', 'G_r', 'hip_l', 'hip_r', 'K_l', 'K_r', 'A_l', 'A_r', 'ball_l', 'ball_r'].forEach(function (k) { addP(P[k], 0.09); });
        addP(P.headTop, 0.05);
        ev.props.forEach(function (pr) { if (pr.m === 'mat') return; if (pr.t === 'box') { var e = Math.max(pr.s[0], pr.s[1], pr.s[2]) * 0.5; addP(pr.c, Math.min(e, 0.35)); } else if (pr.t === 'cyl') { addP(pr.a, pr.r * 0.5); addP(pr.b, pr.r * 0.5); } else addP(pr.c, pr.r); });
      }
      mn[1] = Math.min(mn[1], 0);
      var c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      return { c: c, mn: mn, mx: mx, floorR: Math.max(0.95, Math.hypot(mx[0] - mn[0], mx[2] - mn[2]) * 0.52 + 0.12) };
    }

    function pickAt(nx, ny) {
      if (!latestCfg || !lastEval) return null;
      var h = getHuman(latestCfg.sex); if (!h) return null;
      var px = Math.max(0, Math.min(canvas.width - 1, Math.floor(nx * canvas.width))), py = Math.max(0, Math.min(canvas.height - 1, Math.floor(ny * canvas.height)));
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      drawHuman(h, lastEval, 0, true);
      var out = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return INDEX_TO_MUSCLE[out[0]] || null;
    }

    function renderFrame(cfg, u) {
      latestCfg = cfg;
      var h = getHuman(cfg.sex); if (!h) return null;
      var dpr = Math.min(1.75, root.devicePixelRatio || 1), rect = canvas.getBoundingClientRect();
      var w = Math.max(120, Math.round((rect.width || 320) * dpr)), hh = Math.max(120, Math.round((rect.height || 260) * dpr));
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
      var K = root.IronPulseKinematics3D, isIdle = mode === 'explorer';
      var key = (cfg.sex || 'male') + ':' + (isIdle ? 'idle' : (cfg.exercise ? cfg.exercise.id : ''));
      if (key !== framingKey) {
        framingKey = key; framing = computeFraming(h, cfg);
        var clip = isIdle ? K.CLIPS.idle : K.clipFor(cfg.exercise);
        if (!userDragged && clip && clip.cam && mode !== 'explorer') { camYaw = clip.cam[0]; camPitch = clip.cam[1]; }
      }
      var ev = K.evaluate(h.rig, cfg.exercise, u, isIdle);
      lastEval = ev;
      var aspect = w / hh, fov = 30 * Math.PI / 180;
      var yr = camYaw * Math.PI / 180, pr = camPitch * Math.PI / 180, c = framing.c;
      // tight fit of the rep's bounding box for the current view direction (head-to-toe, never cropped)
      var fw = [Math.sin(yr) * Math.cos(pr), Math.sin(pr), Math.cos(yr) * Math.cos(pr)], rt = [Math.cos(yr), 0, -Math.sin(yr)];
      var upv = [fw[1] * rt[2] - fw[2] * rt[1], fw[2] * rt[0] - fw[0] * rt[2], fw[0] * rt[1] - fw[1] * rt[0]];
      var tv = Math.tan(fov / 2), th = tv * aspect, need = 0.5;
      for (var ci = 0; ci < 8; ci++) {
        var q = [(ci & 1 ? framing.mx[0] : framing.mn[0]) - c[0], (ci & 2 ? framing.mx[1] : framing.mn[1]) - c[1], (ci & 4 ? framing.mx[2] : framing.mn[2]) - c[2]];
        var qx = q[0] * rt[0] + q[2] * rt[2], qy = q[0] * upv[0] + q[1] * upv[1] + q[2] * upv[2], qz = q[0] * fw[0] + q[1] * fw[1] + q[2] * fw[2];
        need = Math.max(need, qz + Math.abs(qx) / th, qz + (qy > 0 ? qy * 1.2 : -qy * 1.05) / tv);
      }
      var dist = need * 1.06 * zoom;
      camPos = [c[0] + Math.sin(yr) * Math.cos(pr) * dist, c[1] + Math.sin(pr) * dist, c[2] + Math.cos(yr) * Math.cos(pr) * dist];
      var proj = new Float32Array(16), view = new Float32Array(16);
      m4Perspective(proj, fov, aspect, 0.05, 40); m4LookAt(view, camPos, c); m4Mul(viewProj, proj, view);
      updateMuscleTexture(cfg, ev.p);
      if (canvas.parentElement) canvas.parentElement.classList.toggle('studio-light', globalBackdrop === 'light');
      gl.viewport(0, 0, w, hh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.disable(gl.CULL_FACE);
      drawProps(ev.props);
      drawHuman(h, ev, ev.p, false);
      drawFloor([c[0], 0, c[2]], framing.floorR, ev);
      return { phase: ev.phase, p: ev.p, pose: ev.pose, props: ev.props };
    }

    var rafId = null, lastTs = 0, u = 0, paused = false, speed = 1.0;
    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
      if (!paused) u = (u + dt * (mode === 'explorer' ? 0.16 : 0.3) * speed) % 1;
      var res = renderFrame(options.getConfig(), u);
      if (options.onFrame && res) options.onFrame(res, u);
      rafId = root.requestAnimationFrame(tick);
    }
    if (!options.manual) rafId = root.requestAnimationFrame(tick);

    return {
      stop: function () {
        if (rafId) root.cancelAnimationFrame(rafId); rafId = null;
        canvas.removeEventListener('mousedown', onDown); root.removeEventListener('mousemove', onMove); root.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('touchstart', onDown); canvas.removeEventListener('touchmove', onMove); canvas.removeEventListener('touchend', onUp);
        try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (ignored) { /* noop */ }
      },
      setPaused: function (v) { paused = !!v; },
      isPaused: function () { return paused; },
      setSpeed: function (s) { speed = s; },
      setProgress: function (val) { u = Math.max(0, Math.min(0.999, val)); },
      renderAt: function (val) { u = val; return renderFrame(options.getConfig(), u); },
      setZoom: function (z) { zoom = Math.max(0.3, Math.min(1.6, z)); userDragged = true; },
      setCameraAngle: function (yawDeg, pitchDeg) { userDragged = true; camYaw = yawDeg; if (pitchDeg != null) camPitch = pitchDeg; },
      setPresetView: function (key) {
        userDragged = true;
        var K = root.IronPulseKinematics3D, clip = latestCfg && latestCfg.exercise ? K.clipFor(latestCfg.exercise) : null;
        var pr = clip && clip.presets && clip.presets[key];
        if (pr) { camYaw = pr[0]; camPitch = pr[1]; }
        else if (key === 'front') { camYaw = 0; camPitch = 8; } else if (key === 'threeq') { camYaw = 40; camPitch = 12; } else if (key === 'side') { camYaw = 90; camPitch = 6; }
      }
    };
  }

  root.IronPulse3D = { create3DScene: create3DScene, setGlobalStyle: setGlobalStyle, getGlobalStyle: getGlobalStyle, setGlobalBackdrop: setGlobalBackdrop, getGlobalBackdrop: getGlobalBackdrop, MUSCLE_INDEX: MUSCLE_INDEX };
})(typeof window !== 'undefined' ? window : globalThis);
