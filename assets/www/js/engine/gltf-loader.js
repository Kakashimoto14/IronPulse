/* IronPulse v3 — minimal offline glTF 2.0 binary (.glb) loader for skinned humans.
 * Zero dependencies. Supports: one skinned triangle primitive, POSITION/NORMAL (float or
 * KHR_mesh_quantization normalized ints), JOINTS_0 (u8/u16), WEIGHTS_0 (float/u8/u16 normalized),
 * optional _AO, uint16/uint32 indices, node TRS hierarchy -> world-space bind joint positions.
 * Bone names are mapped onto the IronPulse 23-bone rig (native names, Mixamo and MPFB/Rigify aliases).
 */
(function (root) {
  'use strict';

  var RIG_BONES = [
    'pelvis', 'spine', 'chest', 'neck', 'head',
    'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'fingers_l', 'fingertips_l',
    'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'fingers_r', 'fingertips_r',
    'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'toes_l', 'toes_r', 'thumb_l', 'thumb_r'
  ];
  var RIG_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 8, 9, 2, 11, 12, 13, 14, 15, 0, 17, 18, 0, 20, 21, 19, 22, 8, 14];

  // Third-party skeleton aliases (lower-cased, prefixes stripped). Untested drop-in path.
  var ALIASES = {
    hips: 'pelvis', pelvis: 'pelvis', root: 'pelvis',
    spine: 'spine', spine01: 'spine', spine1: 'spine', spine_01: 'spine',
    spine2: 'chest', spine02: 'chest', spine03: 'chest', chest: 'chest', upperchest: 'chest', spine_02: 'chest',
    neck: 'neck', neck01: 'neck', head: 'head',
    leftshoulder: 'clavicle_l', clavicle_l: 'clavicle_l', 'shoulder.l': 'clavicle_l',
    leftarm: 'upperarm_l', upperarm_l: 'upperarm_l', 'upper_arm.l': 'upperarm_l',
    leftforearm: 'lowerarm_l', lowerarm_l: 'lowerarm_l', 'forearm.l': 'lowerarm_l',
    lefthand: 'hand_l', hand_l: 'hand_l', 'hand.l': 'hand_l',
    lefthandmiddle1: 'fingers_l', fingers_l: 'fingers_l', lefthandmiddle2: 'fingertips_l', fingertips_l: 'fingertips_l',
    rightshoulder: 'clavicle_r', clavicle_r: 'clavicle_r', 'shoulder.r': 'clavicle_r',
    rightarm: 'upperarm_r', upperarm_r: 'upperarm_r', 'upper_arm.r': 'upperarm_r',
    rightforearm: 'lowerarm_r', lowerarm_r: 'lowerarm_r', 'forearm.r': 'lowerarm_r',
    righthand: 'hand_r', hand_r: 'hand_r', 'hand.r': 'hand_r',
    righthandmiddle1: 'fingers_r', fingers_r: 'fingers_r', righthandmiddle2: 'fingertips_r', fingertips_r: 'fingertips_r',
    leftupleg: 'thigh_l', thigh_l: 'thigh_l', 'thigh.l': 'thigh_l',
    leftleg: 'calf_l', calf_l: 'calf_l', 'shin.l': 'calf_l',
    leftfoot: 'foot_l', foot_l: 'foot_l', 'foot.l': 'foot_l',
    rightupleg: 'thigh_r', thigh_r: 'thigh_r', 'thigh.r': 'thigh_r',
    rightleg: 'calf_r', calf_r: 'calf_r', 'shin.r': 'calf_r',
    rightfoot: 'foot_r', foot_r: 'foot_r', 'foot.r': 'foot_r',
    lefthandthumb1: 'thumb_l', thumb_l: 'thumb_l', 'thumb.01.l': 'thumb_l', righthandthumb1: 'thumb_r', thumb_r: 'thumb_r', 'thumb.01.r': 'thumb_r',
    lefttoebase: 'toes_l', toes_l: 'toes_l', 'toe.l': 'toes_l', righttoebase: 'toes_r', toes_r: 'toes_r', 'toe.r': 'toes_r'
  };

  function b64ToBytes(b64) {
    if (typeof atob === 'function') {
      var s = atob(b64), n = s.length, out = new Uint8Array(n);
      for (var i = 0; i < n; i++) out[i] = s.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  var COMP = {
    5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767],
    5123: [Uint16Array, 65535], 5125: [Uint32Array, 0], 5126: [Float32Array, 0]
  };
  var NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function readAccessor(gltf, bin, idx, asFloat) {
    var acc = gltf.accessors[idx];
    var view = gltf.bufferViews[acc.bufferView];
    var C = COMP[acc.componentType];
    var nc = NCOMP[acc.type];
    var esize = C[0].BYTES_PER_ELEMENT;
    var stride = view.byteStride || esize * nc;
    var base = bin.byteOffset + (view.byteOffset || 0) + (acc.byteOffset || 0);
    var out = asFloat ? new Float32Array(acc.count * nc) : new C[0](acc.count * nc);
    var dv = new DataView(bin.buffer);
    var norm = asFloat && acc.normalized && C[1];
    for (var i = 0; i < acc.count; i++) {
      var o = base + i * stride;
      for (var c = 0; c < nc; c++) {
        var p = o + c * esize, v;
        switch (acc.componentType) {
          case 5120: v = dv.getInt8(p); break;
          case 5121: v = dv.getUint8(p); break;
          case 5122: v = dv.getInt16(p, true); break;
          case 5123: v = dv.getUint16(p, true); break;
          case 5125: v = dv.getUint32(p, true); break;
          default: v = dv.getFloat32(p, true);
        }
        if (norm) v = Math.max(v / C[1], -1);
        out[i * nc + c] = v;
      }
    }
    return out;
  }

  function quatToMat(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }

  function nodeWorld(gltf) {
    var n = gltf.nodes.length, parent = new Array(n).fill(-1);
    gltf.nodes.forEach(function (nd, i) { (nd.children || []).forEach(function (c) { parent[c] = i; }); });
    var world = new Array(n);
    function local(nd) {
      var R = nd.rotation ? quatToMat(nd.rotation) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      var s = nd.scale || [1, 1, 1], t = nd.translation || [0, 0, 0];
      return { R: [R[0] * s[0], R[1] * s[1], R[2] * s[2], R[3] * s[0], R[4] * s[1], R[5] * s[2], R[6] * s[0], R[7] * s[1], R[8] * s[2]], t: t };
    }
    function get(i) {
      if (world[i]) return world[i];
      var L = local(gltf.nodes[i]);
      if (parent[i] < 0) { world[i] = L; return L; }
      var P = get(parent[i]);
      var R = new Array(9);
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) R[r * 3 + c] = P.R[r * 3] * L.R[c] + P.R[r * 3 + 1] * L.R[3 + c] + P.R[r * 3 + 2] * L.R[6 + c];
      var t = [P.R[0] * L.t[0] + P.R[1] * L.t[1] + P.R[2] * L.t[2] + P.t[0],
        P.R[3] * L.t[0] + P.R[4] * L.t[1] + P.R[5] * L.t[2] + P.t[1],
        P.R[6] * L.t[0] + P.R[7] * L.t[1] + P.R[8] * L.t[2] + P.t[2]];
      world[i] = { R: R, t: t };
      return world[i];
    }
    for (var i = 0; i < n; i++) get(i);
    return { world: world, parent: parent };
  }

  function canon(name) {
    var s = String(name || '').toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/^def[-_]/, '').replace(/^orc[-_]/, '');
    return ALIASES[s] || ALIASES[s.replace(/[_\s]/g, '')] || null;
  }

  function parseGLB(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a GLB');
    var jsonLen = dv.getUint32(12, true);
    var gltf = JSON.parse(utf8(bytes.subarray(20, 20 + jsonLen)));
    var off = 20 + jsonLen;
    var binLen = dv.getUint32(off, true);
    var bin = bytes.subarray(off + 8, off + 8 + binLen);
    return { gltf: gltf, bin: bin };
  }

  function loadAvatar(src) {
    var bytes = typeof src === 'string' ? b64ToBytes(src) : src;
    var g = parseGLB(bytes), gltf = g.gltf, bin = g.bin;
    var meshNode = gltf.nodes.filter(function (n) { return n.mesh != null && n.skin != null; })[0];
    if (!meshNode) throw new Error('GLB has no skinned mesh');
    var prim = gltf.meshes[meshNode.mesh].primitives[0];
    var skin = gltf.skins[meshNode.skin];
    var A = prim.attributes;
    var pos = readAccessor(gltf, bin, A.POSITION, true);
    var nVerts = pos.length / 3;
    var nor = readAccessor(gltf, bin, A.NORMAL, true);
    var jnt = readAccessor(gltf, bin, A.JOINTS_0, false);
    var wgt = readAccessor(gltf, bin, A.WEIGHTS_0, true);
    var ao = A._AO != null ? readAccessor(gltf, bin, A._AO, true) : new Float32Array(nVerts).fill(1);
    var idx = readAccessor(gltf, bin, prim.indices, false);
    if (nVerts <= 65535 && !(idx instanceof Uint16Array)) idx = new Uint16Array(idx);

    // map skin joints -> rig bones
    var nw = nodeWorld(gltf);
    var map = new Int16Array(skin.joints.length).fill(-1);
    var head = {}, tail = {};
    skin.joints.forEach(function (ni, j) {
      var nm = canon(gltf.nodes[ni].name);
      if (!nm) return;
      map[j] = RIG_BONES.indexOf(nm);
      head[nm] = nw.world[ni].t.slice();
      var ex = gltf.nodes[ni].extras;
      if (ex && ex.tail) tail[nm] = ex.tail.slice();
    });
    // unmapped joints inherit nearest mapped ancestor
    skin.joints.forEach(function (ni, j) {
      if (map[j] >= 0) return;
      var p = nw.parent[ni];
      while (p >= 0) {
        var k = skin.joints.indexOf(p);
        if (k >= 0 && map[k] >= 0) { map[j] = map[k]; return; }
        p = nw.parent[p];
      }
      map[j] = 0;
    });
    var bones = new Float32Array(nVerts * 4);
    for (var i = 0; i < jnt.length; i++) bones[i] = map[jnt[i]];
    var meta = (skin.extras && skin.extras.ironpulse) || {};
    // derive tails when the file has none
    RIG_BONES.forEach(function (b, bi) {
      if (tail[b] || !head[b]) return;
      var child = RIG_BONES.filter(function (c, ci) { return RIG_PARENT[ci] === bi && head[c]; })[0];
      if (child) tail[b] = head[child].slice();
      else tail[b] = [head[b][0], head[b][1] + 0.1, head[b][2]];
    });
    return {
      name: meshNode.name || 'avatar', meta: meta, sex: meta.sex,
      nVerts: nVerts, nTris: idx.length / 3,
      pos: pos, nor: nor, ao: ao, bones: bones, weights: wgt, idx: idx,
      boneNames: RIG_BONES.slice(), boneParent: RIG_PARENT.slice(), head: head, tail: tail
    };
  }

  var CACHE = {};
  function getAvatar(sex) {
    var key = sex === 'female' ? 'female' : 'male';
    if (CACHE[key]) return CACHE[key];
    var src = root.IronPulseAvatars && root.IronPulseAvatars[key];
    if (!src) return null;
    CACHE[key] = loadAvatar(src);
    return CACHE[key];
  }

  var api = { loadAvatar: loadAvatar, getAvatar: getAvatar, parseGLB: parseGLB, RIG_BONES: RIG_BONES, RIG_PARENT: RIG_PARENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IronPulseGLTF = api;
})(typeof window !== 'undefined' ? window : globalThis);
