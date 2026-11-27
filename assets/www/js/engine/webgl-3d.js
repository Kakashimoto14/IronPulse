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
    for (var v = 0; v < nVerts * 3; v++) {
      pos[v] = dv.getInt16(off, true) / 10000.0;
      off += 2;
    }
    var nor = new Float32Array(nVerts * 3);
    for (var n = 0; n < nVerts * 3; n++) {
      nor[n] = dv.getInt8(off) / 127.0;
      off += 1;
    }
    var muscle = new Float32Array(nVerts);
    for (var m = 0; m < nVerts; m++) muscle[m] = bytes[off++];
    var mat = new Float32Array(nVerts);
    for (var mt = 0; mt < nVerts; mt++) mat[mt] = bytes[off++];
    var b0 = new Float32Array(nVerts);
    for (var j0 = 0; j0 < nVerts; j0++) b0[j0] = bytes[off++];
    var b1 = new Float32Array(nVerts);
    for (var j1 = 0; j1 < nVerts; j1++) b1[j1] = bytes[off++];
    var w0 = new Float32Array(nVerts);
    for (var jw = 0; jw < nVerts; jw++) w0[jw] = bytes[off++] / 255.0;

    var idx = new Uint16Array(nTris * 3);
    for (var ti = 0; ti < nTris * 3; ti++) {
      idx[ti] = dv.getUint16(off, true);
      off += 2;
    }

    var out = {
      nVerts: nVerts,
      nTris: nTris,
      pos: pos,
      nor: nor,
      muscle: muscle,
      mat: mat,
      b0: b0,
      b1: b1,
      w0: w0,
      idx: idx,
      joints: src.joints
    };
    DECODED_CACHE[key] = out;
    return out;
  }

  // Matrix helpers (column-major)
  function m4Perspective(out, fovRad, aspect, near, far) {
    var f = 1.0 / Math.tan(fovRad * 0.5);
    var nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
  }

  function m4LookAt(out, ex, ey, ez, cx, cy, cz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    // up = (0, 1, 0)
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

  // Build model matrix aligning local +Y cylinder from point A to point B with radius r
  function m4Segment(ax, ay, az, bx, by, bz, r) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.hypot(dx, dy, dz) || 0.001;
    var ux = dx / len, uy = dy / len, uz = dz / len;
    var rx = 0, ry = 1, rz = 0;
    if (Math.abs(uy) > 0.92) { rx = 1; ry = 0; rz = 0; }
    // right = normalize(cross(ref, u))
    var tx = ry * uz - rz * uy;
    var ty = rz * ux - rx * uz;
    var tz = rx * uy - ry * ux;
    var tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // fwd = cross(u, t)
    var fx = uy * tz - uz * ty;
    var fy = uz * tx - ux * tz;
    var fz = ux * ty - uy * tx;

    var mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
    return new Float32Array([
      tx * r, ty * r, tz * r, 0,
      ux * len, uy * len, uz * len, 0,
      fx * r, fy * r, fz * r, 0,
      mx, my, mz, 1
    ]);
  }

  // Shaders
  var VS_HUMAN = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aNor;',
    'attribute float aMuscle;',
    'attribute float aMat;',
    'attribute float aBone0;',
    'attribute float aBone1;',
    'attribute float aWeight0;',
    'uniform mat4 uViewProj;',
    'uniform mat4 uBones[17];',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec3 vLocalPos;',
    'varying float vMuscle;',
    'varying float vMat;',
    'void main() {',
    '  int i0 = int(aBone0 + 0.5);',
    '  int i1 = int(aBone1 + 0.5);',
    '  float w0 = aWeight0;',
    '  float w1 = 1.0 - w0;',
    '  mat4 m0 = uBones[i0];',
    '  mat4 m1 = uBones[i1];',
    '  vec4 p0 = m0 * vec4(aPos, 1.0);',
    '  vec4 p1 = m1 * vec4(aPos, 1.0);',
    '  vec4 wp = p0 * w0 + p1 * w1;',
    '  vec3 n0 = mat3(m0) * aNor;',
    '  vec3 n1 = mat3(m1) * aNor;',
    '  vWorldPos = wp.xyz;',
    '  vNormal = normalize(n0 * w0 + n1 * w1);',
    '  vLocalPos = aPos;',
    '  vMuscle = aMuscle;',
    '  vMat = aMat;',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  var FS_HUMAN = [
    'precision mediump float;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec3 vLocalPos;',
    'varying float vMuscle;',
    'varying float vMat;',
    'uniform vec3 uCamPos;',
    'uniform sampler2D uMuscleTex;',
    'uniform float uStyleMode;', // 0.0 = SCULPT (Studio Marble/Clay), 1.0 = ATHLETE (Skin + Sportswear)
    'uniform float uPulse;',
    'uniform float uPickMode;',
    'void main() {',
    '  float mId = floor(vMuscle + 0.5);',
    '  if (uPickMode > 0.5) {',
    '    gl_FragColor = vec4(mId / 255.0, 0.0, 0.0, 1.0);',
    '    return;',
    '  }',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamPos - vWorldPos);',
    '  vec4 mData = texture2D(uMuscleTex, vec2((mId + 0.5) / 32.0, 0.5));',
    '  float activeAmt = mData.a;',
    '  // Base material albedo (Sculpted Alabaster Clay vs Realistic Athletic Skin + Sportswear)',
    '  vec3 baseCol;',
    '  float specPow = 28.0;',
    '  float specStr = 0.24;',
    '  if (uStyleMode < 0.5) {',
    '    // Studio 3D Alabaster/Marble Ecorche (MoveKit / reference image 1 style)',
    '    baseCol = vec3(0.76, 0.78, 0.81);',
    '    if (vMat > 2.5 && vMat < 3.5) baseCol = vec3(0.24, 0.26, 0.30);', // shoes
    '    else if (vMat > 3.5) baseCol = vec3(0.55, 0.57, 0.61);', // hair
    '    specPow = 22.0; specStr = 0.28;',
    '  } else {',
    '    // Realistic Athletic Skin + Charcoal Gym Shorts & Sports Top (TikTok reference style)',
    '    baseCol = vec3(0.82, 0.64, 0.53);',
    '    specPow = 26.0; specStr = 0.20;',
    '    if (vMat > 0.5 && vMat < 1.5 && activeAmt < 0.55) {',
    '      baseCol = vec3(0.11, 0.13, 0.17); specPow = 12.0; specStr = 0.12;', // charcoal gym shorts
    '    } else if (vMat > 1.5 && vMat < 2.5 && activeAmt < 0.55) {',
    '      baseCol = vec3(0.13, 0.15, 0.19); specPow = 14.0; specStr = 0.14;', // female sports top
    '    } else if (vMat > 2.5 && vMat < 3.5) {',
    '      baseCol = vec3(0.16, 0.18, 0.23); specPow = 18.0; specStr = 0.22;', // sneakers
    '    } else if (vMat > 3.5) {',
    '      baseCol = vec3(0.15, 0.12, 0.12); specPow = 32.0; specStr = 0.25;', // ponytail
    '    }',
    '  }',
    '  // Procedural 3D anatomical muscle fiber striations on active target muscles',
    '  float fiberCoord = (mId == 1.0 || mId == 2.0) ? (vLocalPos.y * 135.0 + abs(vLocalPos.x) * 35.0) : (vLocalPos.x * 110.0 + vLocalPos.y * 55.0 + vLocalPos.z * 75.0);',
    '  float striation = 0.88 + 0.12 * sin(fiberCoord);',
    '  vec3 activeCol = mData.rgb * striation;',
    '  // Blend sculpted body with glowing anatomical muscle highlight',
    '  vec3 albedo = mix(baseCol, activeCol, activeAmt * 0.92);',
    '  // 3-Point Studio Lighting + Crevice AO + Fresnel Rim Light',
    '  vec3 L1 = normalize(vec3(0.55, 0.78, 0.68));',  // warm key light
    '  vec3 L2 = normalize(vec3(-0.72, 0.25, -0.55));', // cool rim/fill light
    '  vec3 L3 = normalize(vec3(0.0, -0.45, 0.85));',   // soft bounce
    '  float ndl1 = max(dot(N, L1), 0.0);',
    '  float ndl2 = max(dot(N, L2), 0.0);',
    '  float ndl3 = max(dot(N, L3), 0.0);',
    '  float hemi = 0.5 + 0.5 * N.y;',
    '  vec3 H1 = normalize(L1 + V);',
    '  float spec = pow(max(dot(N, H1), 0.0), specPow) * specStr;',
    '  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  // Subtle anatomical shadow depth in concave/downward crevices',
    '  float ao = 0.62 + 0.38 * hemi;',
    '  vec3 col = albedo * (vec3(0.24, 0.25, 0.28) * ao + vec3(0.88, 0.85, 0.82) * ndl1 + vec3(0.24, 0.30, 0.40) * ndl2 + vec3(0.16, 0.16, 0.18) * ndl3);',
    '  col += vec3(1.0, 0.96, 0.92) * spec;',
    '  // Subtle subsurface crimson emission on primary firing muscles + studio rim highlight',
    '  col += mData.rgb * (activeAmt * (0.14 + 0.16 * uPulse));',
    '  col += mix(vec3(0.55, 0.65, 0.82), mData.rgb, activeAmt * 0.6) * fresnel * 0.34;',
    '  // Subtle studio floor shadow fade near soles',
    '  col *= (0.85 + 0.15 * smoothstep(0.0, 0.25, vWorldPos.y));',
    '  // Soft Filmic tone-curve',
    '  col = col / (col + vec3(0.65));',
    '  col = pow(max(col, vec3(0.0)), vec3(0.86));',
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
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsSrc);
    var fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return p;
  }

  // Procedural 3D primitives (Unit Box & Unit Cylinder along Y in [-0.5..0.5], radius 1)
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
      for (var k = 1; k <= 4; k++) {
        pos.push(f[k][0], f[k][1], f[k][2]);
        nor.push(n[0], n[1], n[2]);
      }
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
    for (var j = 0; j < segs; j++) {
      var b = j * 2;
      idx.push(b, b+1, b+3, b, b+3, b+2);
    }
    // Top & bottom caps
    var topCenter = pos.length / 3;
    pos.push(0, 0.5, 0); nor.push(0, 1, 0);
    for (var t = 0; t <= segs; t++) {
      var a1 = (t / segs) * Math.PI * 2;
      pos.push(Math.cos(a1), 0.5, Math.sin(a1)); nor.push(0, 1, 0);
      if (t > 0) idx.push(topCenter, topCenter + t, topCenter + t + 1);
    }
    var botCenter = pos.length / 3;
    pos.push(0, -0.5, 0); nor.push(0, -1, 0);
    for (var bt = 0; bt <= segs; bt++) {
      var a2 = (bt / segs) * Math.PI * 2;
      pos.push(Math.cos(a2), -0.5, Math.sin(a2)); nor.push(0, -1, 0);
      if (bt > 0) idx.push(botCenter, botCenter + bt + 1, botCenter + bt);
    }
    return uploadPropGeom(gl, pos, nor, idx);
  }

  function uploadPropGeom(gl, pos, nor, idx) {
    var bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    var bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
    var bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { bp: bp, bn: bn, bi: bi, count: idx.length };
  }

  function uploadHumanMesh(gl, data) {
    function makeBuf(arr) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return b;
    }
    var bi = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    return {
      pos: makeBuf(data.pos), nor: makeBuf(data.nor), muscle: makeBuf(data.muscle),
      mat: makeBuf(data.mat), b0: makeBuf(data.b0), b1: makeBuf(data.b1), w0: makeBuf(data.w0),
      idx: bi, count: data.idx.length, joints: data.joints
    };
  }

  // Global style preference ('sculpt' = marble/grey ecorche like image 1, 'athlete' = warm skin + dark shorts)
  var globalStyle = 'sculpt';
  function setGlobalStyle(st) { globalStyle = st === 'athlete' ? 'athlete' : 'sculpt'; }
  function getGlobalStyle() { return globalStyle; }

  function create3DScene(canvas, options) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: false });
    if (!gl) return null;

    var progHuman = compileProgram(gl, VS_HUMAN, FS_HUMAN);
    var progProp = compileProgram(gl, VS_PROP, FS_PROP);
    if (!progHuman || !progProp) return null;

    var hLoc = {
      aPos: gl.getAttribLocation(progHuman, 'aPos'),
      aNor: gl.getAttribLocation(progHuman, 'aNor'),
      aMuscle: gl.getAttribLocation(progHuman, 'aMuscle'),
      aMat: gl.getAttribLocation(progHuman, 'aMat'),
      aBone0: gl.getAttribLocation(progHuman, 'aBone0'),
      aBone1: gl.getAttribLocation(progHuman, 'aBone1'),
      aWeight0: gl.getAttribLocation(progHuman, 'aWeight0'),
      uViewProj: gl.getUniformLocation(progHuman, 'uViewProj'),
      uBones: gl.getUniformLocation(progHuman, 'uBones[0]'),
      uCamPos: gl.getUniformLocation(progHuman, 'uCamPos'),
      uMuscleTex: gl.getUniformLocation(progHuman, 'uMuscleTex'),
      uStyleMode: gl.getUniformLocation(progHuman, 'uStyleMode'),
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

    // 32x1 Muscle highlight RGBA lookup texture
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

    // Orbit camera state (drag 360 deg with 1 finger!)
    var mode = (options && options.mode) || 'exercise'; // 'exercise' | 'explorer'
    var camYaw = (options && options.initialYaw != null) ? options.initialYaw : (mode === 'explorer' ? 0 : 32);
    var camPitch = (options && options.initialPitch != null) ? options.initialPitch : (mode === 'explorer' ? 6 : 14);
    var camDist = (options && options.initialDist != null) ? options.initialDist : (mode === 'explorer' ? 2.72 : 2.65);
    var camTargetY = (options && options.targetY != null) ? options.targetY : 0.94;
    var userDragged = false;
    var dragging = false;
    var downX = 0, downY = 0, lastX = 0, lastY = 0, movedDist = 0;

    function onDown(e) {
      var pt = e.touches ? e.touches[0] : e;
      dragging = true;
      downX = lastX = pt.clientX;
      downY = lastY = pt.clientY;
      movedDist = 0;
    }
    function onMove(e) {
      if (!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - lastX;
      var dy = pt.clientY - lastY;
      lastX = pt.clientX;
      lastY = pt.clientY;
      movedDist += Math.hypot(dx, dy);
      if (movedDist > 4) {
        userDragged = true;
        camYaw -= dx * 0.58;
        camPitch = Math.max(-22, Math.min(55, camPitch + dy * 0.36));
        if (e.cancelable) e.preventDefault();
      }
    }
    function onUp(e) {
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
    var lastCamPos = [0, 1.1, 2.7];

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
            r = 255; g = 56; b = 68; a = 250;
          } else if (val >= 65) {
            r = 232; g = 28; b = 46; a = 235;
          } else if (val >= 30) {
            r = 236; g = 132; b = 18; a = 200;
          } else if (val > 0) {
            r = 26; g = 192; b = 128; a = 170;
          }
          muscleTexData[id * 4] = r;
          muscleTexData[id * 4 + 1] = g;
          muscleTexData[id * 4 + 2] = b;
          muscleTexData[id * 4 + 3] = a;
        });
      } else if (cfg.exercise) {
        var ex = cfg.exercise;
        (ex.stabilizers || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          muscleTexData[id*4]=72; muscleTexData[id*4+1]=136; muscleTexData[id*4+2]=235; muscleTexData[id*4+3]=95;
        });
        (ex.secondary || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          muscleTexData[id*4]=238; muscleTexData[id*4+1]=112; muscleTexData[id*4+2]=42; muscleTexData[id*4+3]=185;
        });
        (ex.primary || []).forEach(function (mKey) {
          var id = MUSCLE_INDEX[mKey];
          if (!id) return;
          var boost = Math.round(215 + pulse * 40);
          muscleTexData[id*4]=245; muscleTexData[id*4+1]=26; muscleTexData[id*4+2]=44; muscleTexData[id*4+3]=boost;
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

      gl.bindBuffer(gl.ARRAY_BUFFER, geom.bp);
      gl.enableVertexAttribArray(pLoc.aPos);
      gl.vertexAttribPointer(pLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, geom.bn);
      gl.enableVertexAttribArray(pLoc.aNor);
      gl.vertexAttribPointer(pLoc.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geom.bi);
      gl.drawElements(gl.TRIANGLES, geom.count, gl.UNSIGNED_SHORT, 0);
    }

    function draw3DEquipment(cfg, skinRes) {
      // Subtle studio circular floor platform
      drawProp(cylGeom, m4Box(0, -0.015, 0, 0.92, 0.03, 0.92), [0.12, 0.14, 0.19], 0.25);

      if (mode === 'explorer' || !cfg.exercise) return;
      var ex = cfg.exercise;
      var prop = ex.equipProp;
      var prof = skinRes.profile;
      var wj = skinRes.worldJoints;
      var lH = [wj[7][12], wj[7][13], wj[7][14]];
      var rH = [wj[10][12], wj[10][13], wj[10][14]];

      // Flat / Incline Bench / Seat
      if (prof.bench === 'flat') {
        drawProp(boxGeom, m4Box(0, 0.42, -0.18, 0.34, 0.07, 1.18), [0.16, 0.18, 0.23], 0.15);
        drawProp(boxGeom, m4Box(0, 0.21, -0.62, 0.07, 0.42, 0.07), [0.35, 0.38, 0.45], 0.75);
        drawProp(boxGeom, m4Box(0, 0.21,  0.26, 0.07, 0.42, 0.07), [0.35, 0.38, 0.45], 0.75);
        drawProp(boxGeom, m4Box(0, 0.02, -0.62, 0.44, 0.04, 0.09), [0.22, 0.24, 0.29], 0.6);
        drawProp(boxGeom, m4Box(0, 0.02,  0.26, 0.44, 0.04, 0.09), [0.22, 0.24, 0.29], 0.6);
      } else if (prof.bench === 'incline') {
        drawProp(boxGeom, m4Box(0, 0.30, 0.10, 0.34, 0.07, 0.42), [0.16, 0.18, 0.23], 0.15);
        drawProp(boxGeom, m4Box(0, 0.20, 0.12, 0.07, 0.36, 0.07), [0.35, 0.38, 0.45], 0.75);
        drawProp(cylGeom, m4Segment(0, 0.32, -0.05, 0, 0.92, -0.58, 0.14), [0.16, 0.18, 0.23], 0.15);
        drawProp(boxGeom, m4Box(0, 0.40, -0.50, 0.07, 0.80, 0.07), [0.35, 0.38, 0.45], 0.75);
      } else if (prof.bench === 'seat') {
        drawProp(boxGeom, m4Box(0, 0.48, 0.02, 0.36, 0.07, 0.42), [0.16, 0.18, 0.23], 0.15);
        drawProp(boxGeom, m4Box(0, 0.24, 0.02, 0.08, 0.48, 0.08), [0.35, 0.38, 0.45], 0.75);
      }

      // Arm Wrestling Table
      if (prof.awTable) {
        drawProp(boxGeom, m4Box(0.10, 1.02, 0.34, 0.82, 0.06, 0.56), [0.15, 0.17, 0.22], 0.2);
        drawProp(boxGeom, m4Box(0.22, 1.07, 0.24, 0.22, 0.04, 0.22), [0.65, 0.12, 0.18], 0.15);
        drawProp(boxGeom, m4Box(-0.26, 0.51, 0.12, 0.05, 1.02, 0.05), [0.30, 0.34, 0.40], 0.75);
        drawProp(boxGeom, m4Box( 0.46, 0.51, 0.12, 0.05, 1.02, 0.05), [0.30, 0.34, 0.40], 0.75);
        drawProp(boxGeom, m4Box(-0.26, 0.51, 0.56, 0.05, 1.02, 0.05), [0.30, 0.34, 0.40], 0.75);
        drawProp(boxGeom, m4Box( 0.46, 0.51, 0.56, 0.05, 1.02, 0.05), [0.30, 0.34, 0.40], 0.75);
      }

      // Handheld 3D Props anchored to exact real-time 3D hand positions!
      if (prop === 'barbell') {
        var bx = rH[0] - lH[0], by = rH[1] - lH[1], bz = rH[2] - lH[2];
        var bl = Math.hypot(bx, by, bz) || 0.4;
        var ux = bx / bl, uy = by / bl, uz = bz / bl;
        var cx = (lH[0] + rH[0]) * 0.5, cy = (lH[1] + rH[1]) * 0.5, cz = (lH[2] + rH[2]) * 0.5;
        // If squat, rest bar across upper traps/shoulders cleanly
        if (ex.kinematics === 'squat') {
          cy = wj[2][13] + 0.16;
          cz = wj[2][14] - 0.08;
        }
        var halfLen = 0.88;
        var pA = [cx - ux * halfLen, cy - uy * halfLen, cz - uz * halfLen];
        var pB = [cx + ux * halfLen, cy + uy * halfLen, cz + uz * halfLen];
        drawProp(cylGeom, m4Segment(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], 0.018), [0.80, 0.84, 0.90], 0.92);
        // Stacked Olympic Iron Plates on both ends
        [-1, 1].forEach(function (s) {
          [[0.62, 0.67, 0.19], [0.68, 0.72, 0.15], [0.73, 0.76, 0.11]].forEach(function (pl) {
            drawProp(
              cylGeom,
              m4Segment(cx + ux*s*pl[0], cy + uy*s*pl[0], cz + uz*s*pl[0], cx + ux*s*pl[1], cy + uy*s*pl[1], cz + uz*s*pl[1], pl[2]),
              [0.14, 0.16, 0.20], 0.55
            );
          });
        });
      } else if (prop === 'dumbbells') {
        [lH, rH].forEach(function (h) {
          drawProp(cylGeom, m4Segment(h[0]-0.11, h[1], h[2], h[0]+0.11, h[1], h[2], 0.016), [0.82, 0.86, 0.92], 0.9);
          drawProp(cylGeom, m4Segment(h[0]-0.13, h[1], h[2], h[0]-0.07, h[1], h[2], 0.068), [0.15, 0.17, 0.21], 0.5);
          drawProp(cylGeom, m4Segment(h[0]+0.07, h[1], h[2], h[0]+0.13, h[1], h[2], 0.068), [0.15, 0.17, 0.21], 0.5);
        });
      } else if (prop === 'pullup_bar') {
        var barY = ex.kinematics === 'inverted_row' ? 0.88 : 2.02;
        drawProp(cylGeom, m4Segment(-0.72, barY, 0.0, 0.72, barY, 0.0, 0.022), [0.78, 0.82, 0.88], 0.9);
        drawProp(cylGeom, m4Segment(-0.72, 0, 0, -0.72, barY, 0, 0.028), [0.22, 0.25, 0.30], 0.6);
        drawProp(cylGeom, m4Segment( 0.72, 0, 0,  0.72, barY, 0, 0.028), [0.22, 0.25, 0.30], 0.6);
      } else if (prop === 'dip_bars') {
        [-0.30, 0.30].forEach(function (dx) {
          drawProp(cylGeom, m4Segment(dx, 1.05, -0.35, dx, 1.05, 0.35, 0.022), [0.75, 0.80, 0.86], 0.88);
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
        drawProp(cylGeom, m4Segment(rH[0], rH[1], rH[2], rH[0], Math.max(0.18, rH[1] - 0.55), rH[2], 0.015), [0.88, 0.14, 0.20], 0.25);
        drawProp(cylGeom, m4Segment(rH[0], Math.max(0.08, rH[1] - 0.62), rH[2], rH[0], Math.max(0.18, rH[1] - 0.52), rH[2], 0.12), [0.14, 0.16, 0.21], 0.6);
      } else if (prop === 'kettlebell' || prop === 'medball') {
        var mx = (lH[0]+rH[0])*0.5, my = (lH[1]+rH[1])*0.5 - 0.05, mz = (lH[2]+rH[2])*0.5;
        drawProp(cylGeom, m4Segment(mx, my-0.10, mz, mx, my+0.10, mz, 0.11), prop === 'medball' ? [0.68, 0.14, 0.18] : [0.15, 0.17, 0.22], 0.45);
      } else if (prop === 'box') {
        drawProp(boxGeom, m4Box(0, 0.22, prof.box === 'back' ? -0.78 : 0.45, 0.55, 0.44, 0.50), [0.17, 0.19, 0.25], 0.25);
      }
    }

    function drawHumanPass(gpuMesh, skinRes, pulse, pickMode) {
      gl.useProgram(progHuman);
      gl.uniformMatrix4fv(hLoc.uViewProj, false, lastViewProj);
      gl.uniformMatrix4fv(hLoc.uBones, false, skinRes.bones);
      gl.uniform3fv(hLoc.uCamPos, lastCamPos);
      gl.uniform1f(hLoc.uStyleMode, globalStyle === 'athlete' ? 1.0 : 0.0);
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
      bindAttr(hLoc.aMuscle, gpuMesh.muscle, 1);
      bindAttr(hLoc.aMat, gpuMesh.mat, 1);
      bindAttr(hLoc.aBone0, gpuMesh.b0, 1);
      bindAttr(hLoc.aBone1, gpuMesh.b1, 1);
      bindAttr(hLoc.aWeight0, gpuMesh.w0, 1);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpuMesh.idx);
      gl.drawElements(gl.TRIANGLES, gpuMesh.count, gl.UNSIGNED_SHORT, 0);
    }

    var latestCfg = null;

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
      drawHumanPass(gpuMesh, lastSkinResult, 0, true);
      var out = new Uint8Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      var mId = out[0];
      return INDEX_TO_MUSCLE[mId] || null;
    }

    function renderFrame(cfg, u) {
      latestCfg = cfg;
      var gpuMesh = getGpuMesh(cfg.sex);
      if (!gpuMesh) return null;

      // Resize backing buffer cleanly at 1.5x max DPR for crisp Retina edges & rock-solid 60 FPS
      var dpr = Math.min(1.6, root.devicePixelRatio || 1);
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(120, Math.round((rect.width || 320) * dpr));
      var h = Math.max(120, Math.round((rect.height || 260) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      var isIdle = (mode === 'explorer');
      var exId = cfg.exercise ? cfg.exercise.id : '';
      if (!isIdle && exId !== lastExerciseId) {
        lastExerciseId = exId;
        var prof = root.IronPulseKinematics3D.PROFILES[cfg.exercise ? cfg.exercise.kinematics : 'squat'];
        if (prof && prof.cam && !userDragged) {
          camYaw = prof.cam[0];
          camPitch = prof.cam[1];
          camDist = prof.cam[2];
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

      // Compute camera position from orbit angles
      var yr = camYaw * Math.PI / 180;
      var pr = camPitch * Math.PI / 180;
      var cx = Math.sin(yr) * Math.cos(pr) * camDist;
      var cy = camTargetY + Math.sin(pr) * camDist;
      var cz = Math.cos(yr) * Math.cos(pr) * camDist;
      lastCamPos = [cx, cy, cz];

      var proj = new Float32Array(16);
      var view = new Float32Array(16);
      m4Perspective(proj, 38 * Math.PI / 180, w / h, 0.1, 20.0);
      m4LookAt(view, cx, cy, cz, 0, camTargetY, 0);
      m4Mul(lastViewProj, proj, view);

      updateMuscleTexture(cfg, skinRes.p);

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      draw3DEquipment(cfg, skinRes);
      drawHumanPass(gpuMesh, skinRes, skinRes.p, false);
      return skinRes;
    }

    // Animation loop
    var rafId = null;
    var lastTs = 0;
    var u = 0;
    var paused = false;
    var speed = 1.0;

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      if (!paused) {
        u = (u + dt * (mode === 'explorer' ? 0.16 : 0.34) * speed) % 1;
      }
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
        try {
          var ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        } catch (ignored) {}
      },
      setPaused: function (v) { paused = !!v; },
      isPaused: function () { return paused; },
      setSpeed: function (s) { speed = s; },
      setProgress: function (val) { u = Math.max(0, Math.min(0.999, val)); },
      setCameraAngle: function (yawDeg, pitchDeg) {
        userDragged = true;
        camYaw = yawDeg;
        if (pitchDeg != null) camPitch = pitchDeg;
      },
      getCameraYaw: function () { return camYaw; }
    };
  }

  root.IronPulse3D = {
    create3DScene: create3DScene,
    setGlobalStyle: setGlobalStyle,
    getGlobalStyle: getGlobalStyle,
    MUSCLE_INDEX: MUSCLE_INDEX
  };
})(typeof window !== 'undefined' ? window : globalThis);
