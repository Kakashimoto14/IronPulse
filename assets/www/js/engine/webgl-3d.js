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

  var DECODED_CACHE = {};
  function decodeMesh(sex) {
    var key = sex === 'female' ? 'female' : 'male';
    if (DECODED_CACHE[key]) return DECODED_CACHE[key];
    var src = root.IronPulseMeshes && root.IronPulseMeshes[key];
    if (!src) return null;

    var binStr = atob(src.b64);
    var len = binStr.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    var dv = new DataView(bytes.buffer);
    var nVerts = dv.getUint32(0, true);
    var nTris = dv.getUint32(4, true);

    var off = 8;
    var pos = new Float32Array(nVerts * 3);
    for (var v = 0; v < nVerts * 3; v++) { pos[v] = dv.getInt16(off, true) / 10000.0; off += 2; }
    var nor = new Float32Array(nVerts * 3);
    for (var n = 0; n < nVerts * 3; n++) { nor[n] = dv.getInt8(off) / 127.0; off += 1; }
    // Skip legacy muscle & mat byte lanes (now evaluated at 4K pixel precision inside FS_HUMAN!)
    off += nVerts * 2;
    var b0 = new Float32Array(nVerts);
    for (var j0 = 0; j0 < nVerts; j0++) b0[j0] = bytes[off++];
    var b1 = new Float32Array(nVerts);
    for (var j1 = 0; j1 < nVerts; j1++) b1[j1] = bytes[off++];
    var w0 = new Float32Array(nVerts);
    for (var jw = 0; jw < nVerts; jw++) w0[jw] = bytes[off++] / 255.0;
    var idx = new Uint16Array(nTris * 3);
    for (var ti = 0; ti < nTris * 3; ti++) { idx[ti] = dv.getUint16(off, true); off += 2; }

    var out = { nVerts: nVerts, nTris: nTris, pos: pos, nor: nor, b0: b0, b1: b1, w0: w0, idx: idx, joints: src.joints };
    DECODED_CACHE[key] = out;
    return out;
  }

  function m4Perspective(out, fovRad, aspect, near, far) {
    var f = 1.0 / Math.tan(fovRad * 0.5);
    var nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
  }

  function m4LookAt(out, ex, ey, ez, cx, cy, cz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = zz, xy = 0, xz = -zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
    out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
    out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
    out[12]=-(xx*ex+xy*ey+xz*ez);
    out[13]=-(yx*ex+yy*ey+yz*ez);
    out[14]=-(zx*ex+zy*ey+zz*ez);
    out[15]=1;
    return out;
  }

  function m4Mul(out, a, b) {
    var r = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var row = 0; row < 4; row++) {
        r[c*4+row] = a[row]*b[c*4] + a[4+row]*b[c*4+1] + a[8+row]*b[c*4+2] + a[12+row]*b[c*4+3];
      }
    }
    out.set(r);
    return out;
  }

  function m4Box(x, y, z, sx, sy, sz) {
    var m = new Float32Array(16);
    m[0]=sx; m[5]=sy; m[10]=sz; m[15]=1;
    m[12]=x; m[13]=y; m[14]=z;
    return m;
  }

  function m4Segment(ax, ay, az, bx, by, bz, r) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.hypot(dx, dy, dz) || 0.001;
    var ux = dx / len, uy = dy / len, uz = dz / len;
    var rx = 0, ry = 1, rz = 0;
    if (Math.abs(uy) > 0.92) { rx = 1; ry = 0; rz = 0; }
    var tx = ry * uz - rz * uy, ty = rz * ux - rx * uz, tz = rx * uy - ry * ux;
    var tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    var fx = uy * tz - uz * ty, fy = uz * tx - ux * tz, fz = ux * ty - uy * tx;
    return new Float32Array([
      tx*r, ty*r, tz*r, 0,
      ux*len, uy*len, uz*len, 0,
      fx*r, fy*r, fz*r, 0,
      (ax+bx)*0.5, (ay+by)*0.5, (az+bz)*0.5, 1
    ]);
  }

  var VS_HUMAN = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aNor;',
    'attribute float aBone0;',
    'attribute float aBone1;',
    'attribute float aWeight0;',
    'uniform mat4 uViewProj;',
    'uniform mat4 uBones[17];',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec3 vLocalPos;',
    'void main() {',
    '  int i0 = int(aBone0 + 0.5);',
    '  int i1 = int(aBone1 + 0.5);',
    '  float w0 = aWeight0;',
    '  float w1 = 1.0 - w0;',
    '  mat4 m0 = uBones[i0];',
    '  mat4 m1 = uBones[i1];',
    '  vec4 wp = (m0 * vec4(aPos, 1.0)) * w0 + (m1 * vec4(aPos, 1.0)) * w1;',
    '  vec3 wn = (mat3(m0) * aNor) * w0 + (mat3(m1) * aNor) * w1;',
    '  vWorldPos = wp.xyz;',
    '  vNormal = normalize(wn);',
    '  vLocalPos = aPos;',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  // High-Precision Per-Pixel Anatomical Muscle & Sportswear Fragment Shader (Zero Jagged Hems!)
  var FS_HUMAN = [
    'precision highp float;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec3 vLocalPos;',
    'uniform vec3 uCamPos;',
    'uniform sampler2D uMuscleTex;',
    'uniform float uStyleMode;', // 0.0 = SCULPT (Lyfta silver ecorche), 1.0 = SKIN (Athletic warm skin + sportswear)
    'uniform float uIsFemale;',
    'uniform float uPulse;',
    'uniform float uPickMode;',
    '',
    '// Per-pixel smooth anatomical muscle classification in bind-pose 3D space (zero polygon jaggedness!)',
    'float classifyMuscle(vec3 p, float isF) {',
    '  float ax = abs(p.x);',
    '  float y = p.y;',
    '  float z = p.z;',
    '  float shX = mix(0.222, 0.166, isF);',
    '  float shY = mix(1.445, 1.430, isF);',
    '  float elX = shX + mix(0.205, 0.185, isF);',
    '  float elY = shY - mix(0.175, 0.180, isF);',
    '  float wrX = elX + mix(0.165, 0.155, isF);',
    '  float wrY = elY - mix(0.165, 0.165, isF);',
    '  float chestW = mix(0.192, 0.140, isF);',
    '  float pelW = mix(0.168, 0.184, isF);',
    '',
    '  // Head, Neck & Feet stay neutral',
    '  if (y > 1.535 || y < 0.095) return 0.0;',
    '',
    '  // 1. Deltoids (teardrop 3-head shoulder cap wrapping smoothly over joint)',
    '  vec3 dSh = vec3(ax - shX, (y - (shY - 0.015)) * 0.88, z);',
    '  float rDelt = mix(0.096, 0.074, isF);',
    '  if (length(dSh) < rDelt && ax > shX * 0.74) {',
    '    if (z > 0.024) return 3.0;',        // front_delts
    '    if (z < -0.024) return 5.0;',       // rear_delts
    '    return 4.0;',                       // side_delts
    '  }',
    '',
    '  // 2. Arms (Upper Arm & Forearm projected cleanly along anatomical bone axes)',
    '  if (ax > shX + 0.022 && y > 0.90) {',
    '    vec2 ua = vec2(elX - shX, elY - shY);',
    '    float tUa = dot(vec2(ax - shX, y - shY), ua) / dot(ua, ua);',
    '    vec2 fa = vec2(wrX - elX, wrY - elY);',
    '    float tFa = dot(vec2(ax - elX, y - elY), fa) / dot(fa, fa);',
    '    if (tUa >= 0.16 && tUa <= 0.98 && tFa < 0.04) {',
    '      return (z >= -0.004) ? 10.0 : 11.0;', // biceps / triceps
    '    }',
    '    if (tFa >= 0.04 && tFa <= 0.92) {',
    '      if (z < -0.004) return 14.0;',        // pronators
    '      return (tFa < 0.50) ? 12.0 : 13.0;',  // brachioradialis / wrist_flexors
    '    }',
    '    return 0.0;', // hands stay clean skin
    '  }',
    '',
    '  // 3. Torso (Front & Back anatomical silhouettes)',
    '  if (y >= 0.95 && y <= 1.535 && ax <= chestW * 1.15) {',
    '    // Upper Traps slope & upper-back diamond hood',
    '    float trapTop = 1.535 - ax * 0.42;',
    '    if (y > 1.435 && y < trapTop && ax < shX * 0.84 && z < 0.035) return 6.0;',
    '    if (z < -0.015 && y >= 1.355 && y <= 1.515 && ax < 0.115 * (1.0 - (1.46 - y) * 1.6)) return 6.0;',
    '    // Front Torso: Fan-shaped Pectorals (curved lower arc + sternum split, NOT flat stripe!)',
    '    if (z >= 0.015) {',
    '      float pecArcBot = 1.275 + 0.24 * pow(max(0.0, (ax - 0.095) / 0.10), 2.0) + 0.012 * exp(-ax * 48.0);',
    '      float pecArcTop = 1.440 - 0.12 * ax;',
    '      float pecMidSplit = 1.372 - 0.08 * ax;',
    '      if (y >= pecArcBot && y <= pecArcTop && ax > 0.008 && ax < shX * 0.90) {',
    '        return (y >= pecMidSplit) ? 1.0 : 2.0;', // upper_chest / mid_chest
    '      }',
    '      // Sculpted Rectus Abdominis (6-pack column) & External Obliques',
    '      float abW = mix(0.076, 0.058, isF);',
    '      if (y >= 0.985 && y < pecArcBot - 0.005) {',
    '        if (ax < abW) return 15.0;', // abs
    '        return 16.0;',               // obliques
    '      }',
    '    }',
    '    // Back Torso: Rhomboids, V-Taper Lats, Lower Back',
    '    if (z < 0.015) {',
    '      if (y >= 1.255 && y < 1.385 && ax < 0.092) return 8.0;', // rhomboids
    '      if (y >= 1.115 && y < 1.395 && ax >= 0.078) return 7.0;', // lats
    '      if (y >= 0.975 && y < 1.255 && ax < 0.092) return 9.0;', // lower_back
    '    }',
    '  }',
    '',
    '  // 4. Lower Body: Glutes, Quads, Hamstrings, Calves',
    '  if (y >= 0.81 && y < 0.995 && z < -0.015 && ax < pelW * 1.12) return 17.0;', // glutes
    '  if (y >= 0.52 && y < 0.91 && ax < pelW * 1.30) {',
    '    return (z >= -0.006) ? 18.0 : 19.0;', // quads / hamstrings
    '  }',
    '  if (y >= 0.145 && y < 0.455 && ax < pelW * 1.25) return 20.0;', // calves
    '  return 0.0;',
    '}',
    '',
    'void main() {',
    '  vec3 p = vLocalPos;',
    '  float mId = classifyMuscle(p, uIsFemale);',
    '  if (uPickMode > 0.5) {',
    '    gl_FragColor = vec4(mId / 255.0, 0.0, 0.0, 1.0);',
    '    return;',
    '  }',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamPos - vWorldPos);',
    '  vec4 mData = texture2D(uMuscleTex, vec2((mId + 0.5) / 32.0, 0.5));',
    '  float activeAmt = mData.a;',
    '',
    '  float ax = abs(p.x);',
    '  float y = p.y;',
    '  float z = p.z;',
    '',
    '  // Per-pixel razor-sharp sportswear masks (smoothstep = anti-aliased 4K crisp hem, ZERO jaggedness!)',
    '  float shortBot = mix(0.745, 0.735, uIsFemale);',
    '  float shortTop = mix(0.988, 1.015, uIsFemale);',
    '  float shortsMask = smoothstep(shortBot - 0.005, shortBot + 0.005, y) * (1.0 - smoothstep(shortTop - 0.005, shortTop + 0.005, y)) * (1.0 - smoothstep(0.24, 0.27, ax));',
    '  float waistBand = smoothstep(shortTop - 0.026, shortTop - 0.021, y) * shortsMask;',
    '  // Female sleek athletic sports crop top (clean curved neckline + crisp bottom band)',
    '  float braBot = 1.252;',
    '  float braTop = 1.392 - 0.028 * exp(-ax * 26.0);',
    '  float braMask = uIsFemale * smoothstep(braBot - 0.005, braBot + 0.005, y) * (1.0 - smoothstep(braTop - 0.005, braTop + 0.005, y)) * (1.0 - smoothstep(0.145, 0.162, ax));',
    '  // Sneakers + clean white athletic sole',
    '  float shoeMask = 1.0 - smoothstep(0.082, 0.088, y);',
    '  float soleMask = 1.0 - smoothstep(0.018, 0.023, y);',
    '  // Female ponytail hair mask',
    '  float hairMask = uIsFemale * smoothstep(1.45, 1.48, y) * (1.0 - smoothstep(-0.082, -0.070, z));',
    '',
    '  // Subtle anatomical shading grooves (sternum, linea alba, spinal furrow) for crisp 3D definition',
    '  float groove = 1.0;',
    '  if (y > 0.99 && y < 1.43 && z > 0.04) {',
    '    // Center linea alba & sternum crease',
    '    groove -= 0.14 * exp(-pow(ax / 0.009, 2.0));',
    '    // Subtle horizontal ab tender lines',
    '    if (y < 1.26 && ax < 0.072) {',
    '      float abLines = exp(-pow((y - 1.188) / 0.007, 2.0)) + exp(-pow((y - 1.118) / 0.007, 2.0)) + exp(-pow((y - 1.048) / 0.007, 2.0));',
    '      groove -= mix(0.11, 0.05, uIsFemale) * abLines;',
    '    }',
    '    // Crisp under-pec arc shadow',
    '    float pecCreaseY = 1.275 + 0.24 * pow(max(0.0, (ax - 0.095) / 0.10), 2.0);',
    '    if (ax < 0.155 && ax > 0.015) groove -= 0.15 * exp(-pow((y - pecCreaseY) / 0.008, 2.0));',
    '  }',
    '  if (y > 0.98 && y < 1.44 && z < -0.04) {',
    '    // Athletic spinal furrow',
    '    groove -= 0.16 * exp(-pow(ax / 0.012, 2.0));',
    '  }',
    '  groove = clamp(groove, 0.72, 1.0);',
    '',
    '  // Base Albedo (SCULPT = Lyfta silver-alabaster ecorche, SKIN = warm sunlit athletic skin)',
    '  vec3 baseCol;',
    '  float specPow = 28.0;',
    '  float specStr = 0.28;',
    '  if (uStyleMode < 0.5) {',
    '    baseCol = vec3(0.79, 0.81, 0.85) * groove;',
    '    // Clean dark-slate compression shorts in sculpt mode (unless glutes/quads are actively highlighted)',
    '    float clothShow = shortsMask * (1.0 - activeAmt * 0.82);',
    '    baseCol = mix(baseCol, mix(vec3(0.15, 0.17, 0.22), vec3(0.22, 0.25, 0.31), waistBand), clothShow);',
    '    float braShow = braMask * (1.0 - activeAmt * 0.82);',
    '    baseCol = mix(baseCol, vec3(0.16, 0.18, 0.23), braShow);',
    '    baseCol = mix(baseCol, vec3(0.18, 0.20, 0.26), shoeMask);',
    '    baseCol = mix(baseCol, vec3(0.86, 0.88, 0.92), soleMask);',
    '    baseCol = mix(baseCol, vec3(0.38, 0.41, 0.47), hairMask);',
    '    specPow = 24.0; specStr = 0.32;',
    '  } else {',
    '    // Warm healthy athletic skin tone (NOT grey clay!)',
    '    baseCol = vec3(0.87, 0.67, 0.54) * (0.90 + 0.10 * groove);',
    '    float clothShow = shortsMask * (1.0 - activeAmt * 0.72);',
    '    baseCol = mix(baseCol, mix(vec3(0.10, 0.11, 0.15), vec3(0.19, 0.21, 0.27), waistBand), clothShow);',
    '    float braShow = braMask * (1.0 - activeAmt * 0.72);',
    '    baseCol = mix(baseCol, vec3(0.11, 0.12, 0.16), braShow);',
    '    baseCol = mix(baseCol, vec3(0.14, 0.16, 0.21), shoeMask);',
    '    baseCol = mix(baseCol, vec3(0.92, 0.93, 0.96), soleMask);',
    '    baseCol = mix(baseCol, vec3(0.13, 0.10, 0.09), hairMask);',
    '    specPow = 26.0; specStr = 0.22;',
    '  }',
    '',
    '  // Procedural anatomical muscle-fiber striations on highlighted muscles',
    '  float fCoord = (mId == 1.0 || mId == 2.0) ? (p.y * 150.0 + ax * 42.0) : (p.x * 115.0 + p.y * 55.0 + p.z * 80.0);',
    '  float fiber = 0.86 + 0.14 * sin(fCoord);',
    '  vec3 activeCol = mData.rgb * fiber * (0.88 + 0.12 * groove);',
    '  vec3 albedo = mix(baseCol, activeCol, activeAmt * 0.90);',
    '',
    '  // Studio 3-Point PBR-Inspired Lighting + Warm Subsurface Wrap + Crisp Rim',
    '  vec3 L1 = normalize(vec3(0.48, 0.74, 0.72));',
    '  vec3 L2 = normalize(vec3(-0.75, 0.30, -0.45));',
    '  vec3 L3 = normalize(vec3(0.0, -0.35, 0.92));',
    '  float ndl1 = max(dot(N, L1), 0.0);',
    '  float wrap1 = max((dot(N, L1) + 0.35) / 1.35, 0.0);',
    '  float ndl2 = max(dot(N, L2), 0.0);',
    '  float ndl3 = max(dot(N, L3), 0.0);',
    '  float hemi = 0.5 + 0.5 * N.y;',
    '  vec3 H1 = normalize(L1 + V);',
    '  float spec = pow(max(dot(N, H1), 0.0), specPow) * specStr;',
    '  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '',
    '  vec3 warmBounce = mix(vec3(0.24, 0.26, 0.30), vec3(0.32, 0.24, 0.20), uStyleMode);',
    '  vec3 col = albedo * (warmBounce * (0.65 + 0.35 * hemi) + vec3(0.92, 0.90, 0.88) * mix(ndl1, wrap1, 0.35) + vec3(0.26, 0.32, 0.44) * ndl2 + vec3(0.18, 0.18, 0.20) * ndl3);',
    '  col += vec3(1.0, 0.98, 0.96) * spec;',
    '  col += mData.rgb * (activeAmt * (0.12 + 0.14 * uPulse));',
    '  col += mix(vec3(0.68, 0.76, 0.90), mData.rgb, activeAmt * 0.55) * fresnel * 0.32;',
    '  col = col / (col + vec3(0.62));',
    '  col = pow(max(col, vec3(0.0)), vec3(0.88));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var VS_PROP = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aNor;',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'void main() {',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  vNormal = normalize(mat3(uModel) * aNor);',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  var FS_PROP = [
    'precision mediump float;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uColor;',
    'uniform float uMetal;',
    'void main() {',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamPos - vWorldPos);',
    '  vec3 L1 = normalize(vec3(0.55, 0.80, 0.65));',
    '  vec3 L2 = normalize(vec3(-0.7, 0.3, -0.5));',
    '  float d1 = max(dot(N, L1), 0.0);',
    '  float d2 = max(dot(N, L2), 0.0);',
    '  vec3 H = normalize(L1 + V);',
    '  float spec = pow(max(dot(N, H), 0.0), mix(18.0, 48.0, uMetal)) * mix(0.22, 0.72, uMetal);',
    '  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.25;',
    '  vec3 col = uColor * (0.30 + 0.75 * d1 + 0.25 * d2) + vec3(0.95, 0.97, 1.0) * (spec + rim);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compileProgram(gl, vsSrc, fsSrc) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsSrc);
    var fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return p;
  }

  function uploadPropGeom(gl, pos, nor, idx) {
    var bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    var bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
    var bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { bp: bp, bn: bn, bi: bi, count: idx.length };
  }

  function createBoxGeom(gl) {
    var faces = [
      [[0,0,1],  [-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],
      [[0,0,-1], [.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],
      [[1,0,0],  [.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],
      [[-1,0,0], [-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],
      [[0,1,0],  [-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],
      [[0,-1,0], [-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]
    ];
    var pos = [], nor = [], idx = [];
    faces.forEach(function (f, fi) {
      var n = f[0];
      for (var k = 1; k <= 4; k++) { pos.push(f[k][0], f[k][1], f[k][2]); nor.push(n[0], n[1], n[2]); }
      var b = fi * 4;
      idx.push(b, b+1, b+2, b, b+2, b+3);
    });
    return uploadPropGeom(gl, pos, nor, idx);
  }

  function createCylGeom(gl, segs) {
    var pos = [], nor = [], idx = [];
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ca, -0.5, sa, ca, 0.5, sa);
      nor.push(ca, 0, sa, ca, 0, sa);
    }
    for (var j = 0; j < segs; j++) { var b = j * 2; idx.push(b, b+1, b+3, b, b+3, b+2); }
    var tc = pos.length / 3; pos.push(0, 0.5, 0); nor.push(0, 1, 0);
    for (var t = 0; t <= segs; t++) {
      var a1 = (t / segs) * Math.PI * 2;
      pos.push(Math.cos(a1), 0.5, Math.sin(a1)); nor.push(0, 1, 0);
      if (t > 0) idx.push(tc, tc + t, tc + t + 1);
    }
    var bc = pos.length / 3; pos.push(0, -0.5, 0); nor.push(0, -1, 0);
    for (var bt = 0; bt <= segs; bt++) {
      var a2 = (bt / segs) * Math.PI * 2;
      pos.push(Math.cos(a2), -0.5, Math.sin(a2)); nor.push(0, -1, 0);
      if (bt > 0) idx.push(bc, bc + bt + 1, bc + bt);
    }
    return uploadPropGeom(gl, pos, nor, idx);
  }

  function uploadHumanMesh(gl, data) {
    function makeBuf(arr) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b;
    }
    var bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    return {
      pos: makeBuf(data.pos), nor: makeBuf(data.nor), b0: makeBuf(data.b0), b1: makeBuf(data.b1), w0: makeBuf(data.w0),
      idx: bi, count: data.idx.length, joints: data.joints
    };
  }

  var globalStyle = 'sculpt'; // 'sculpt' (Lyfta silver ecorche) | 'athlete' (warm athletic skin + sportswear)
  var globalBackdrop = 'dark'; // 'dark' | 'light' (Lyfta bright studio card)
  function setGlobalStyle(st) { globalStyle = st === 'athlete' ? 'athlete' : 'sculpt'; }
  function getGlobalStyle() { return globalStyle; }
  function setGlobalBackdrop(b) { globalBackdrop = b === 'light' ? 'light' : 'dark'; }
  function getGlobalBackdrop() { return globalBackdrop; }

  function create3DScene(canvas, options) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
    if (!gl) return null;

    var progHuman = compileProgram(gl, VS_HUMAN, FS_HUMAN);
    var progProp = compileProgram(gl, VS_PROP, FS_PROP);
    if (!progHuman || !progProp) return null;

    var hLoc = {
      aPos: gl.getAttribLocation(progHuman, 'aPos'),
      aNor: gl.getAttribLocation(progHuman, 'aNor'),
      aBone0: gl.getAttribLocation(progHuman, 'aBone0'),
      aBone1: gl.getAttribLocation(progHuman, 'aBone1'),
      aWeight0: gl.getAttribLocation(progHuman, 'aWeight0'),
      uViewProj: gl.getUniformLocation(progHuman, 'uViewProj'),
      uBones: gl.getUniformLocation(progHuman, 'uBones[0]'),
      uCamPos: gl.getUniformLocation(progHuman, 'uCamPos'),
      uMuscleTex: gl.getUniformLocation(progHuman, 'uMuscleTex'),
      uStyleMode: gl.getUniformLocation(progHuman, 'uStyleMode'),
      uIsFemale: gl.getUniformLocation(progHuman, 'uIsFemale'),
      uPulse: gl.getUniformLocation(progHuman, 'uPulse'),
      uPickMode: gl.getUniformLocation(progHuman, 'uPickMode')
    };

    var pLoc = {
      aPos: gl.getAttribLocation(progProp, 'aPos'),
      aNor: gl.getAttribLocation(progProp, 'aNor'),
      uViewProj: gl.getUniformLocation(progProp, 'uViewProj'),
      uModel: gl.getUniformLocation(progProp, 'uModel'),
      uCamPos: gl.getUniformLocation(progProp, 'uCamPos'),
      uColor: gl.getUniformLocation(progProp, 'uColor'),
      uMetal: gl.getUniformLocation(progProp, 'uMetal')
    };

    var boxGeom = createBoxGeom(gl);
    var cylGeom = createCylGeom(gl, 18);

    var muscleTexData = new Uint8Array(32 * 4);
    var muscleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, muscleTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, muscleTexData);

    var gpuMeshes = {};
    function getGpuMesh(sex) {
      var k = sex === 'female' ? 'female' : 'male';
      if (!gpuMeshes[k]) {
        var dec = decodeMesh(k);
        if (dec) gpuMeshes[k] = uploadHumanMesh(gl, dec);
      }
      return gpuMeshes[k];
    }

    var mode = (options && options.mode) || 'exercise';
    // Heroic eye-level framing (fixes the high downward angle!)
    var camYaw = (options && options.initialYaw != null) ? options.initialYaw : (mode === 'explorer' ? 0 : 32);
    var camPitch = (options && options.initialPitch != null) ? options.initialPitch : (mode === 'explorer' ? 2 : 10);
    var camDist = (options && options.initialDist != null) ? options.initialDist : (mode === 'explorer' ? 2.52 : 2.58);
    var camTargetY = (options && options.targetY != null) ? options.targetY : 0.94;
    var userDragged = false;
    var dragging = false;
    var downX = 0, downY = 0, lastX = 0, lastY = 0, movedDist = 0;

    function onDown(e) {
      var pt = e.touches ? e.touches[0] : e;
      dragging = true; downX = lastX = pt.clientX; downY = lastY = pt.clientY; movedDist = 0;
    }
    function onMove(e) {
      if (!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - lastX, dy = pt.clientY - lastY;
      lastX = pt.clientX; lastY = pt.clientY;
      movedDist += Math.hypot(dx, dy);
      if (movedDist > 4) {
        userDragged = true;
        camYaw -= dx * 0.58;
        camPitch = Math.max(-18, Math.min(48, camPitch + dy * 0.34));
        if (e.cancelable) e.preventDefault();
      }
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      if (movedDist < 8 && options && options.onPickMuscle) {
        var rect = canvas.getBoundingClientRect();
        var sx = (downX - rect.left) / rect.width;
        var sy = 1.0 - (downY - rect.top) / rect.height;
        var picked = pickMuscleAt(sx, sy);
        if (picked) options.onPickMuscle(picked);
      }
    }

    canvas.addEventListener('mousedown', onDown);
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp, { passive: true });

    var lastExerciseId = '';
    var lastSkinResult = null;
    var lastViewProj = new Float32Array(16);
    var lastCamPos = [0, 1.02, 2.55];
    var latestCfg = null;

    function updateMuscleTexture(cfg, pulse) {
      muscleTexData.fill(0);
      if (mode === 'explorer') {
        var fat = cfg.fatigueMap || {};
        var sel = cfg.selectedMuscle || 'all';
        Object.keys(MUSCLE_INDEX).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          var val = Number(fat[mKey]) || 0;
          var r = 0, g = 0, b = 0, a = 0;
          if (sel === mKey) {
            r = 244; g = 58; b = 38; a = 250; // Lyfta vivid vermilion-red selection
          } else if (val >= 65) {
            r = 235; g = 42; b = 38; a = 235;
          } else if (val >= 30) {
            r = 240; g = 140; b = 22; a = 205;
          } else if (val > 0) {
            r = 16; g = 185; b = 129; a = 175;
          }
          muscleTexData[id*4]=r; muscleTexData[id*4+1]=g; muscleTexData[id*4+2]=b; muscleTexData[id*4+3]=a;
        });
      } else if (cfg.exercise) {
        var ex = cfg.exercise;
        // Stabilizers: Cool Cyan-Slate
        (ex.stabilizers || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          muscleTexData[id*4]=82; muscleTexData[id*4+1]=168; muscleTexData[id*4+2]=245; muscleTexData[id*4+3]=95;
        });
        // Secondary: Lyfta Electric Indigo-Blue (#4F6BFF) for crisp 2-tone contrast!
        (ex.secondary || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          muscleTexData[id*4]=79; muscleTexData[id*4+1]=107; muscleTexData[id*4+2]=255; muscleTexData[id*4+3]=210;
        });
        // Primary: Vivid Vermilion-Crimson (#F43A26) pulsing with rep contraction
        (ex.primary || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          var boost = Math.round(220 + pulse * 35);
          muscleTexData[id*4]=244; muscleTexData[id*4+1]=58; muscleTexData[id*4+2]=38; muscleTexData[id*4+3]=boost;
        });
      }
      gl.bindTexture(gl.TEXTURE_2D, muscleTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 32, 1, gl.RGBA, gl.UNSIGNED_BYTE, muscleTexData);
    }

    function drawProp(geom, modelMat, color, metal) {
      gl.useProgram(progProp);
      gl.uniformMatrix4fv(pLoc.uViewProj, false, lastViewProj);
      gl.uniformMatrix4fv(pLoc.uModel, false, modelMat);
      gl.uniform3fv(pLoc.uCamPos, lastCamPos);
      gl.uniform3fv(pLoc.uColor, color);
      gl.uniform1f(pLoc.uMetal, metal);
      gl.bindBuffer(gl.ARRAY_BUFFER, geom.bp); gl.enableVertexAttribArray(pLoc.aPos); gl.vertexAttribPointer(pLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geom.bn); gl.enableVertexAttribArray(pLoc.aNor); gl.vertexAttribPointer(pLoc.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geom.bi);
      gl.drawElements(gl.TRIANGLES, geom.count, gl.UNSIGNED_SHORT, 0);
    }

    function draw3DEquipment(cfg, skinRes) {
      var isLight = globalBackdrop === 'light';
      drawProp(cylGeom, m4Box(0, -0.014, 0, 0.88, 0.028, 0.88), isLight ? [0.68, 0.72, 0.78] : [0.13, 0.15, 0.20], 0.2);

      if (mode === 'explorer' || !cfg.exercise) return;
      var ex = cfg.exercise;
      var prop = ex.equipProp;
      var prof = skinRes.profile;
      var wj = skinRes.worldJoints;
      var lH = [wj[7][12], wj[7][13], wj[7][14]];
      var rH = [wj[10][12], wj[10][13], wj[10][14]];

      if (prof.bench === 'flat') {
        drawProp(boxGeom, m4Box(0, 0.42, -0.18, 0.34, 0.07, 1.18), [0.14, 0.16, 0.21], 0.18);
        drawProp(boxGeom, m4Box(0, 0.21, -0.62, 0.07, 0.42, 0.07), [0.38, 0.42, 0.48], 0.78);
        drawProp(boxGeom, m4Box(0, 0.21,  0.26, 0.07, 0.42, 0.07), [0.38, 0.42, 0.48], 0.78);
        drawProp(boxGeom, m4Box(0, 0.02, -0.62, 0.44, 0.04, 0.09), [0.22, 0.24, 0.29], 0.6);
        drawProp(boxGeom, m4Box(0, 0.02,  0.26, 0.44, 0.04, 0.09), [0.22, 0.24, 0.29], 0.6);
      } else if (prof.bench === 'incline') {
        drawProp(boxGeom, m4Box(0, 0.30, 0.10, 0.34, 0.07, 0.42), [0.14, 0.16, 0.21], 0.18);
        drawProp(boxGeom, m4Box(0, 0.20, 0.12, 0.07, 0.36, 0.07), [0.38, 0.42, 0.48], 0.78);
        drawProp(cylGeom, m4Segment(0, 0.32, -0.05, 0, 0.92, -0.58, 0.14), [0.14, 0.16, 0.21], 0.18);
        drawProp(boxGeom, m4Box(0, 0.40, -0.50, 0.07, 0.80, 0.07), [0.38, 0.42, 0.48], 0.78);
      } else if (prof.bench === 'seat') {
        drawProp(boxGeom, m4Box(0, 0.48, 0.02, 0.36, 0.07, 0.42), [0.14, 0.16, 0.21], 0.18);
        drawProp(boxGeom, m4Box(0, 0.24, 0.02, 0.08, 0.48, 0.08), [0.38, 0.42, 0.48], 0.78);
      }

      if (prof.awTable) {
        drawProp(boxGeom, m4Box(0.10, 1.02, 0.34, 0.82, 0.06, 0.56), [0.15, 0.17, 0.22], 0.2);
        drawProp(boxGeom, m4Box(0.22, 1.07, 0.24, 0.22, 0.04, 0.22), [0.76, 0.16, 0.16], 0.15);
        drawProp(boxGeom, m4Box(-0.26, 0.51, 0.12, 0.05, 1.02, 0.05), [0.32, 0.36, 0.42], 0.75);
        drawProp(boxGeom, m4Box( 0.46, 0.51, 0.12, 0.05, 1.02, 0.05), [0.32, 0.36, 0.42], 0.75);
        drawProp(boxGeom, m4Box(-0.26, 0.51, 0.56, 0.05, 1.02, 0.05), [0.32, 0.36, 0.42], 0.75);
        drawProp(boxGeom, m4Box( 0.46, 0.51, 0.56, 0.05, 1.02, 0.05), [0.32, 0.36, 0.42], 0.75);
      }

      if (prop === 'barbell') {
        var bx = rH[0] - lH[0], by = rH[1] - lH[1], bz = rH[2] - lH[2];
        var bl = Math.hypot(bx, by, bz) || 0.4;
        var ux = bx / bl, uy = by / bl, uz = bz / bl;
        var cx = (lH[0] + rH[0]) * 0.5, cy = (lH[1] + rH[1]) * 0.5, cz = (lH[2] + rH[2]) * 0.5;
        if (ex.kinematics === 'squat') { cy = wj[2][13] + 0.16; cz = wj[2][14] - 0.08; }
        var halfLen = 0.88;
        drawProp(cylGeom, m4Segment(cx - ux*halfLen, cy - uy*halfLen, cz - uz*halfLen, cx + ux*halfLen, cy + uy*halfLen, cz + uz*halfLen, 0.018), [0.82, 0.86, 0.92], 0.92);
        [-1, 1].forEach(function (s) {
          [[0.62, 0.67, 0.19], [0.68, 0.72, 0.15], [0.73, 0.76, 0.11]].forEach(function (pl) {
            drawProp(cylGeom, m4Segment(cx+ux*s*pl[0], cy+uy*s*pl[0], cz+uz*s*pl[0], cx+ux*s*pl[1], cy+uy*s*pl[1], cz+uz*s*pl[1], pl[2]), [0.13, 0.15, 0.19], 0.55);
          });
        });
      } else if (prop === 'dumbbells') {
        [lH, rH].forEach(function (h) {
          drawProp(cylGeom, m4Segment(h[0]-0.11, h[1], h[2], h[0]+0.11, h[1], h[2], 0.016), [0.82, 0.86, 0.92], 0.9);
          drawProp(cylGeom, m4Segment(h[0]-0.13, h[1], h[2], h[0]-0.07, h[1], h[2], 0.068), [0.14, 0.16, 0.20], 0.52);
          drawProp(cylGeom, m4Segment(h[0]+0.07, h[1], h[2], h[0]+0.13, h[1], h[2], 0.068), [0.14, 0.16, 0.20], 0.52);
        });
      } else if (prop === 'pullup_bar') {
        var barY = ex.kinematics === 'inverted_row' ? 0.88 : 2.02;
        drawProp(cylGeom, m4Segment(-0.72, barY, 0, 0.72, barY, 0, 0.022), [0.80, 0.84, 0.90], 0.9);
        drawProp(cylGeom, m4Segment(-0.72, 0, 0, -0.72, barY, 0, 0.028), [0.22, 0.25, 0.30], 0.6);
        drawProp(cylGeom, m4Segment( 0.72, 0, 0,  0.72, barY, 0, 0.028), [0.22, 0.25, 0.30], 0.6);
      } else if (prop === 'dip_bars') {
        [-0.30, 0.30].forEach(function (dx) {
          drawProp(cylGeom, m4Segment(dx, 1.05, -0.35, dx, 1.05, 0.35, 0.022), [0.78, 0.82, 0.88], 0.88);
          drawProp(cylGeom, m4Segment(dx, 0, -0.32, dx, 1.05, -0.32, 0.025), [0.22, 0.25, 0.30], 0.6);
          drawProp(cylGeom, m4Segment(dx, 0,  0.32, dx, 1.05,  0.32, 0.025), [0.22, 0.25, 0.30], 0.6);
        });
      } else if (prop === 'cable' || prop === 'aw_cable') {
        var towZ = ex.kinematics === 'cable_fly' ? -0.35 : 0.72;
        drawProp(boxGeom, m4Box(0, 1.02, towZ, 0.26, 2.04, 0.24), [0.16, 0.19, 0.24], 0.5);
        drawProp(cylGeom, m4Segment(0, 1.35, towZ, rH[0], rH[1], rH[2], 0.008), [0.85, 0.88, 0.92], 0.8);
        if (ex.kinematics === 'cable_fly' || ex.kinematics === 'face_pull' || ex.kinematics === 'pulldown') {
          drawProp(cylGeom, m4Segment(0, 1.35, towZ, lH[0], lH[1], lH[2], 0.008), [0.85, 0.88, 0.92], 0.8);
        }
      } else if (prop === 'aw_belt') {
        drawProp(cylGeom, m4Segment(rH[0], rH[1], rH[2], rH[0], Math.max(0.18, rH[1] - 0.55), rH[2], 0.015), [0.92, 0.20, 0.18], 0.25);
        drawProp(cylGeom, m4Segment(rH[0], Math.max(0.08, rH[1] - 0.62), rH[2], rH[0], Math.max(0.18, rH[1] - 0.52), rH[2], 0.12), [0.14, 0.16, 0.21], 0.6);
      } else if (prop === 'kettlebell' || prop === 'medball') {
        var mx = (lH[0]+rH[0])*0.5, my = (lH[1]+rH[1])*0.5 - 0.05, mz = (lH[2]+rH[2])*0.5;
        drawProp(cylGeom, m4Segment(mx, my-0.10, mz, mx, my+0.10, mz, 0.11), prop === 'medball' ? [0.74, 0.18, 0.18] : [0.15, 0.17, 0.22], 0.45);
      } else if (prop === 'box') {
        drawProp(boxGeom, m4Box(0, 0.22, prof.box === 'back' ? -0.78 : 0.45, 0.55, 0.44, 0.50), [0.17, 0.19, 0.25], 0.25);
      }
    }

    function drawHumanPass(gpuMesh, skinRes, sex, pulse, pickMode) {
      gl.useProgram(progHuman);
      gl.uniformMatrix4fv(hLoc.uViewProj, false, lastViewProj);
      gl.uniformMatrix4fv(hLoc.uBones, false, skinRes.bones);
      gl.uniform3fv(hLoc.uCamPos, lastCamPos);
      gl.uniform1f(hLoc.uStyleMode, globalStyle === 'athlete' ? 1.0 : 0.0);
      gl.uniform1f(hLoc.uIsFemale, sex === 'female' ? 1.0 : 0.0);
      gl.uniform1f(hLoc.uPulse, pulse);
      gl.uniform1f(hLoc.uPickMode, pickMode ? 1.0 : 0.0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, muscleTex);
      gl.uniform1i(hLoc.uMuscleTex, 0);

      function bindAttr(loc, buf, size) {
        if (loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      bindAttr(hLoc.aPos, gpuMesh.pos, 3);
      bindAttr(hLoc.aNor, gpuMesh.nor, 3);
      bindAttr(hLoc.aBone0, gpuMesh.b0, 1);
      bindAttr(hLoc.aBone1, gpuMesh.b1, 1);
      bindAttr(hLoc.aWeight0, gpuMesh.w0, 1);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpuMesh.idx);
      gl.drawElements(gl.TRIANGLES, gpuMesh.count, gl.UNSIGNED_SHORT, 0);
    }

    function pickMuscleAt(nx, ny) {
      if (!latestCfg || !lastSkinResult) return null;
      var gpuMesh = getGpuMesh(latestCfg.sex);
      if (!gpuMesh) return null;
      var px = Math.max(0, Math.min(canvas.width - 1, Math.floor(nx * canvas.width)));
      var py = Math.max(0, Math.min(canvas.height - 1, Math.floor(ny * canvas.height)));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      drawHumanPass(gpuMesh, lastSkinResult, latestCfg.sex, 0, true);
      var out = new Uint8Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return INDEX_TO_MUSCLE[out[0]] || null;
    }

    function renderFrame(cfg, u) {
      latestCfg = cfg;
      var gpuMesh = getGpuMesh(cfg.sex);
      if (!gpuMesh) return null;

      var dpr = Math.min(1.75, root.devicePixelRatio || 1);
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(120, Math.round((rect.width || 320) * dpr));
      var h = Math.max(120, Math.round((rect.height || 260) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }

      var isIdle = (mode === 'explorer');
      var exId = cfg.exercise ? cfg.exercise.id : '';
      if (!isIdle && exId !== lastExerciseId) {
        lastExerciseId = exId;
        var prof = root.IronPulseKinematics3D.PROFILES[cfg.exercise ? cfg.exercise.kinematics : 'squat'];
        if (prof && prof.cam && !userDragged) {
          camYaw = prof.cam[0];
          camPitch = Math.min(14, prof.cam[1]);
          camDist = prof.cam[2] * 0.96;
          camTargetY = prof.cam[3];
        }
      }

      var skinRes = root.IronPulseKinematics3D.computeSkinMatrices(
        gpuMesh.joints,
        cfg.exercise ? cfg.exercise.kinematics : 'squat',
        u,
        isIdle
      );
      lastSkinResult = skinRes;

      var yr = camYaw * Math.PI / 180;
      var pr = camPitch * Math.PI / 180;
      var cx = Math.sin(yr) * Math.cos(pr) * camDist;
      var cy = camTargetY + Math.sin(pr) * camDist;
      var cz = Math.cos(yr) * Math.cos(pr) * camDist;
      lastCamPos = [cx, cy, cz];

      var proj = new Float32Array(16);
      var view = new Float32Array(16);
      m4Perspective(proj, 36 * Math.PI / 180, w / h, 0.1, 20.0);
      m4LookAt(view, cx, cy, cz, 0, camTargetY, 0);
      m4Mul(lastViewProj, proj, view);

      updateMuscleTexture(cfg, skinRes.p);

      // Sync light/dark studio backdrop class cleanly
      if (canvas.parentElement) {
        canvas.parentElement.classList.toggle('studio-light', globalBackdrop === 'light');
      }

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      draw3DEquipment(cfg, skinRes);
      drawHumanPass(gpuMesh, skinRes, cfg.sex, skinRes.p, false);
      return skinRes;
    }

    var rafId = null, lastTs = 0, u = 0, paused = false, speed = 1.0;
    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      if (!paused) u = (u + dt * (mode === 'explorer' ? 0.16 : 0.34) * speed) % 1;
      var cfg = options.getConfig();
      var res = renderFrame(cfg, u);
      if (options.onFrame && res) options.onFrame(res, u);
      rafId = root.requestAnimationFrame(tick);
    }
    rafId = root.requestAnimationFrame(tick);

    return {
      stop: function () {
        if (rafId) root.cancelAnimationFrame(rafId);
        rafId = null;
        canvas.removeEventListener('mousedown', onDown);
        root.removeEventListener('mousemove', onMove);
        root.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (ignored) {}
      },
      setPaused: function (v) { paused = !!v; },
      isPaused: function () { return paused; },
      setSpeed: function (s) { speed = s; },
      setProgress: function (val) { u = Math.max(0, Math.min(0.999, val)); },
      setCameraAngle: function (yawDeg, pitchDeg) {
        userDragged = true;
        camYaw = yawDeg;
        if (pitchDeg != null) camPitch = pitchDeg;
      }
    };
  }

  root.IronPulse3D = {
    create3DScene: create3DScene,
    setGlobalStyle: setGlobalStyle,
    getGlobalStyle: getGlobalStyle,
    setGlobalBackdrop: setGlobalBackdrop,
    getGlobalBackdrop: getGlobalBackdrop,
    MUSCLE_INDEX: MUSCLE_INDEX
  };
})(typeof window !== 'undefined' ? window : globalThis);
