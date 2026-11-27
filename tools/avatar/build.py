#!/usr/bin/env python3
"""IronPulse avatar asset pipeline (offline, deterministic).

  python3 tools/avatar/build.py [male|female|all] [--voxel 0.0045] [--verts 30000]

Stages: anatomical SDF sculpt -> marching cubes (4.5 mm) -> diffusion skin weights on
the dense mesh -> quadric-error decimation -> SDF-gradient normals -> baked hemisphere AO
-> glTF 2.0 binary (.glb, skinned, KHR_mesh_quantization normals) -> base64 JS embed.
"""
import heapq
import json
import os
import struct
import sys
import base64
import time

import numpy as np
from scipy import sparse
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

sys.path.insert(0, os.path.dirname(__file__))
from body import build, BONES, BI, MUSCLES, bone_heads_tails  # noqa: E402
from sdf import nrm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NB = len(BONES)


# ----------------------------------------------------------------- meshing
def mesh_sdf(S, voxel, coarse=4):
    lo = np.array([-0.74, -0.012, -0.24])
    hi = np.array([0.74, 1.84, 0.26])
    nc = np.ceil((hi - lo) / (voxel * coarse)).astype(int) + 1
    n = (nc - 1) * coarse + 1
    cx = [lo[i] + np.arange(nc[i]) * voxel * coarse for i in range(3)]
    CG = np.stack(np.meshgrid(*cx, indexing='ij'), -1).reshape(-1, 3)
    dc = S.eval(CG).reshape(nc)
    near = np.abs(dc) < voxel * coarse * 1.8
    from scipy.ndimage import binary_dilation, zoom
    near = binary_dilation(near, iterations=1)
    # fine volume initialised from trilinear upsample of the coarse field
    vol = zoom(np.clip(dc, -0.05, 0.05), coarse, order=1)[:n[0], :n[1], :n[2]]
    cells = np.argwhere(near[:-1, :-1, :-1])
    off = np.stack(np.meshgrid(*[np.arange(coarse + 1)] * 3, indexing='ij'), -1).reshape(-1, 3)
    for chunk in np.array_split(cells, max(1, len(cells) // 6000)):
        idx = np.unique((chunk[:, None, :] * coarse + off[None]).reshape(-1, 3), axis=0)
        P = lo + idx * voxel
        vol[tuple(idx.T)] = S.eval(P)
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(voxel,) * 3)
    verts += lo
    faces = faces[:, ::-1]
    return verts, faces.astype(np.int64)


def clean_mesh(V, F):
    # keep largest connected component(s) > 2% (drops MC specks)
    nv = len(V)
    A = sparse.coo_matrix((np.ones(len(F) * 3), (F.ravel(), np.roll(F, 1, axis=1).ravel())), shape=(nv, nv))
    ncomp, lab = sparse.csgraph.connected_components(A, directed=False)
    counts = np.bincount(lab)
    keep = counts[lab] > 0.02 * nv
    fk = keep[F].all(1)
    F = F[fk]
    used = np.unique(F)
    remap = -np.ones(nv, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return V[used], remap[F]


def adjacency(V, F):
    nv = len(V)
    i = np.concatenate([F[:, 0], F[:, 1], F[:, 2], F[:, 1], F[:, 2], F[:, 0]])
    j = np.concatenate([F[:, 1], F[:, 2], F[:, 0], F[:, 0], F[:, 1], F[:, 2]])
    A = sparse.csr_matrix((np.ones(len(i)), (i, j)), shape=(nv, nv))
    A.data[:] = 1.0
    deg = np.asarray(A.sum(1)).ravel()
    return A, deg


def taubin(V, F, it=6, lam=0.5, mu=-0.53):
    A, deg = adjacency(V, F)
    Dinv = sparse.diags(1.0 / np.maximum(deg, 1))
    L = Dinv @ A
    for _ in range(it):
        V = V + lam * (L @ V - V)
        V = V + mu * (L @ V - V)
    return V


# ------------------------------------------------------------ skin weights
def skin_weights(S, V, F):
    D = S.raw_dists(V)
    best = np.argmin(D, axis=1)
    label = np.array([S.prims[b].bone for b in best])
    for pi, pr in enumerate(S.prims):
        spl = getattr(pr, 'split', None)
        if spl is not None:
            m = best == pi
            if m.any():
                side = (V[m] - spl[2]) @ spl[3]
                label[m] = np.where(side > 0, spl[1], spl[0])
        ch = getattr(pr, 'chain', None)
        if ch is None:
            continue
        m = best == pi
        if m.any():
            t = pr.seg_t(V[m])
            label[m] = np.where(t < ch[2], ch[0], ch[1])
    W = np.zeros((len(V), NB))
    W[np.arange(len(V)), label] = 1.0
    stiff = np.ones(NB)
    for n, i in BI.items():
        if n.startswith(('fingers', 'fingertips')):
            stiff[i] = 0.06
        elif n.startswith('hand'):
            stiff[i] = 0.12
        elif n.startswith(('foot',)):
            stiff[i] = 0.18
        elif n.startswith('toes'):
            stiff[i] = 0.08
        elif n.startswith('thumb'):
            stiff[i] = 0.06
        elif n.startswith(('lowerarm', 'calf')):
            stiff[i] = 0.42
        elif n.startswith(('head', 'neck')):
            stiff[i] = 0.35
    alpha = stiff[label]
    A, deg = adjacency(V, F)
    L = sparse.diags(1.0 / np.maximum(deg, 1)) @ A
    for _ in range(110):
        W = W + alpha[:, None] * (L @ W - W)
    # top-4 & normalise
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, axis=1)
    w[w < 0.015] = 0
    w /= w.sum(1, keepdims=True)
    return idx, w, label


# -------------------------------------------------------------- decimation
def decimate(V, F, target):
    V = V.copy()
    nv = len(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    area = np.linalg.norm(fn, axis=1)
    n = fn / np.maximum(area[:, None], 1e-15)
    d = -np.einsum('ij,ij->i', n, V[F[:, 0]])
    p = np.concatenate([n, d[:, None]], 1)
    K = np.einsum('fi,fj->fij', p, p) * (area[:, None, None] * 0.5)
    Q = np.zeros((nv, 4, 4))
    for c in range(3):
        np.add.at(Q, F[:, c], K)
    faces = [list(f) for f in F]
    alive = [True] * len(faces)
    vf = [set() for _ in range(nv)]
    for fi, f in enumerate(faces):
        for v in f:
            vf[v].add(fi)
    valive = [True] * nv
    stamp = [0] * nv
    Vl = V.tolist()

    def nbrs(v):
        s = set()
        for fi in vf[v]:
            s.update(faces[fi])
        s.discard(v)
        return s

    def cost(a, b):
        Qs = Q[a] + Q[b]
        A3 = Qs[:3, :3]
        pa, pb = np.array(Vl[a]), np.array(Vl[b])
        mid = (pa + pb) * 0.5
        cands = [pa, pb, mid]
        try:
            if abs(np.linalg.det(A3)) > 1e-14:
                x = np.linalg.solve(A3, -Qs[:3, 3])
                if np.linalg.norm(x - mid) < 1.5 * np.linalg.norm(pa - pb):
                    cands.append(x)
        except np.linalg.LinAlgError:
            pass
        best, bx = None, None
        for x in cands:
            h = np.append(x, 1.0)
            c = h @ Qs @ h
            if best is None or c < best:
                best, bx = c, x
        # mild length term keeps triangles well shaped
        best += 2e-7 * np.dot(pa - pb, pa - pb)
        return best, bx

    heap = []
    edges = set()
    for f in faces:
        for i in range(3):
            a, b = f[i], f[(i + 1) % 3]
            e = (min(a, b), max(a, b))
            if e not in edges:
                edges.add(e)
                c, x = cost(*e)
                heap.append((c, e[0], e[1], 0, 0, tuple(x)))
    heapq.heapify(heap)
    count = nv
    while count > target and heap:
        c, a, b, sa, sb, x = heapq.heappop(heap)
        if not (valive[a] and valive[b]) or stamp[a] != sa or stamp[b] != sb:
            continue
        Na, Nb = nbrs(a), nbrs(b)
        if b not in Na:
            continue
        if len(Na & Nb) != 2:
            continue
        x = np.array(x)
        ok = True
        for v, other in ((a, b), (b, a)):
            for fi in vf[v]:
                f = faces[fi]
                if other in f:
                    continue
                P = [np.array(Vl[q]) for q in f]
                n0 = np.cross(P[1] - P[0], P[2] - P[0])
                P = [x if q == v else np.array(Vl[q]) for q in f]
                n1 = np.cross(P[1] - P[0], P[2] - P[0])
                l1 = np.linalg.norm(n1)
                if l1 < 1e-12 or np.dot(n0, n1) < 0.25 * np.linalg.norm(n0) * l1:
                    ok = False
                    break
            if not ok:
                break
        if not ok:
            continue
        # collapse b -> a
        for fi in list(vf[b]):
            f = faces[fi]
            if a in f:
                alive[fi] = False
                for q in f:
                    vf[q].discard(fi)
            else:
                f[f.index(b)] = a
                vf[a].add(fi)
        vf[b] = set()
        valive[b] = False
        Vl[a] = list(x)
        Q[a] = Q[a] + Q[b]
        stamp[a] += 1
        count -= 1
        for q in nbrs(a):
            cc, xx = cost(a, q)
            e0, e1 = (a, q) if a < q else (q, a)
            heapq.heappush(heap, (cc, e0, e1, stamp[e0], stamp[e1], tuple(xx)))
    Fo = np.array([f for fi, f in enumerate(faces) if alive[fi]], dtype=np.int64)
    used = np.unique(Fo)
    remap = -np.ones(nv, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return np.array(Vl)[used], remap[Fo]


# ---------------------------------------------------------- normals & AO
def sdf_normals(S, V, eps=0.0012):
    g = np.zeros_like(V)
    for i in range(3):
        e = np.zeros(3)
        e[i] = eps
        g[:, i] = S.eval(V + e) - S.eval(V - e)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)


def bake_ao(S, V, N):
    # hemisphere: normal + 6 tilted directions, 4 radii
    tang = np.cross(N, np.where(np.abs(N[:, 1:2]) < 0.9, [[0, 1, 0]], [[1, 0, 0]]))
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    bit = np.cross(N, tang)
    dirs = [N]
    for k in range(6):
        a = k * np.pi / 3
        dirs.append(nrm_rows(N * 0.75 + (tang * np.cos(a) + bit * np.sin(a)) * 0.66))
    radii = [0.008, 0.018, 0.035, 0.065]
    occ = np.zeros(len(V))
    tot = 0
    for dv in dirs:
        for r in radii:
            w = 1.0 / (1 + r * 14)
            dd = S.eval(V + N * 0.0008 + dv * r)
            occ += w * np.clip((r - dd) / r, 0, 1)
            tot += w
    ao = 1.0 - np.clip(occ / tot * 1.6, 0, 1)
    return np.clip(ao, 0.08, 1.0)


def nrm_rows(a):
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-12)


# --------------------------------------------------------------- regions
def muscle_regions(S, extra=(), inflate=0.011):
    regs = []
    for pr in list(S.prims) + list(extra):
        if not pr.muscle:
            continue
        if pr.kind == 'ell':
            c, R, r = pr.c, pr.R, pr.r
        elif pr.kind == 'rcone':
            c = (pr.a + pr.b) * 0.5
            a = nrm(pr.b - pr.a)
            f = nrm(np.cross(a, [0.31, 0.17, 0.93]))
            R = np.stack([a, f, np.cross(a, f)])
            rr = (pr.r1 + pr.r2) * 0.5
            r = np.array([np.linalg.norm(pr.b - pr.a) * 0.5 + rr * 0.6, rr, rr])
        elif pr.kind == 'rbox':
            c, R, r = pr.c, pr.R, pr.h + pr.rad
        else:
            continue
        if c[0] < -0.002:
            continue  # mirrored in shader with abs(x)
        infl = getattr(pr, 'inflate', inflate)
        regs.append({'m': int(pr.muscle), 'c': [round(float(v), 5) for v in c],
                     'R': [round(float(v), 5) for v in np.asarray(R).ravel()], 'r': [round(float(v) + infl, 5) for v in r]})
    return regs


# -------------------------------------------------------------------- GLB
def write_glb(path, sex, V, N, J4, W4, AO, F, J, meta, regions, D):
    H, T = bone_heads_tails(J)
    names = [b[0] for b in BONES]
    blob = bytearray()
    views, accs = [], []

    def add(arr, comp, typ, target=None, normalized=False, minmax=False):
        nonlocal blob
        while len(blob) % 4:
            blob += b'\x00'
        off = len(blob)
        raw = arr.tobytes()
        blob += raw
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}
        if target:
            v['target'] = target
        if typ != 'SCALAR' and target == 34962 and arr.dtype.itemsize * {'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[typ] % 4:
            pass
        views.append(v)
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if normalized:
            a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in arr.min(0)]
            a['max'] = [float(x) for x in arr.max(0)]
        accs.append(a)
        return len(accs) - 1

    pos = V.astype(np.float32)
    nq = np.zeros((len(N), 4), dtype=np.int8)
    nq[:, :3] = np.clip(np.round(N * 127), -127, 127)
    a_pos = add(pos, 5126, 'VEC3', 34962, minmax=True)
    a_nor = add(nq, 5120, 'VEC4', 34962, normalized=True)
    views[-1]['byteStride'] = 4
    accs[-1]['type'] = 'VEC3'
    a_j = add(J4.astype(np.uint8), 5121, 'VEC4', 34962)
    w8 = np.round(W4 * 255).astype(np.int32)
    w8[:, 0] += 255 - w8.sum(1)
    a_w = add(w8.astype(np.uint8), 5121, 'VEC4', 34962, normalized=True)
    ao4 = np.zeros((len(AO), 4), dtype=np.uint8)
    ao4[:, 0] = np.round(AO * 255)
    a_ao = add(ao4, 5121, 'VEC4', 34962, normalized=True)
    views[-1]['byteStride'] = 4
    accs[-1]['type'] = 'SCALAR'
    a_idx = add(F.astype(np.uint16).ravel(), 5123, 'SCALAR', 34963)
    ibm = np.zeros((NB, 16), dtype=np.float32)
    for i, n in enumerate(names):
        m = np.eye(4)
        m[:3, 3] = -H[n]
        ibm[i] = m.T.ravel()
    a_ibm = add(ibm, 5126, 'MAT4')

    nodes = []
    children = {i: [] for i in range(NB)}
    for i, (n, par) in enumerate(BONES):
        if par >= 0:
            children[par].append(i)
    for i, (n, par) in enumerate(BONES):
        t = H[n] - (H[names[par]] if par >= 0 else 0)
        nd = {'name': n, 'translation': [float(x) for x in t]}
        if children[i]:
            nd['children'] = children[i]
        nd['extras'] = {'tail': [float(x) for x in T[n]]}
        nodes.append(nd)
    mesh_node = len(nodes)
    nodes.append({'name': 'IronPulse_' + sex, 'mesh': 0, 'skin': 0})
    rig = {
        'version': 3, 'sex': sex, 'units': 'm', 'up': 'Y', 'forward': 'Z', 'left': 'X',
        'palm': {k: [float(x) for x in v] for k, v in meta['palm'].items()},
        'thumb': {k: [float(x) for x in v] for k, v in meta['thumb'].items()},
        'elbowHinge': {k: [float(x) for x in v] for k, v in meta['hinge'].items()},
        'clothing': meta['clothing'],
        'height': float(J['top'][1]),
        'regions': regions,
        'muscles': MUSCLES,
    }
    gltf = {
        'asset': {'version': '2.0', 'generator': 'IronPulse avatar pipeline v3 (tools/avatar/build.py)', 'copyright': 'IronPulse - CC0 procedural asset'},
        'extensionsUsed': ['KHR_mesh_quantization'],
        'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0,
        'scenes': [{'nodes': [0, mesh_node]}],
        'nodes': nodes,
        'meshes': [{'name': 'body', 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'JOINTS_0': a_j, 'WEIGHTS_0': a_w, '_AO': a_ao},
            'indices': a_idx, 'mode': 4}]}],
        'skins': [{'name': 'IronPulseRig', 'joints': list(range(NB)), 'inverseBindMatrices': a_ibm, 'skeleton': 0,
                   'extras': {'ironpulse': rig}}],
        'accessors': accs,
        'bufferViews': views,
        'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    while len(blob) % 4:
        blob += b'\x00'
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    with open(path, 'wb') as fh:
        fh.write(out)
    return out


def run(sex, voxel, target):
    t0 = time.time()
    S, J, meta, D = build(sex)
    print(f'[{sex}] {len(S.prims)} primitives')
    V, F = mesh_sdf(S, voxel)
    V, F = clean_mesh(V, F)
    print(f'[{sex}] marching cubes: {len(V)} verts {len(F)} tris  ({time.time()-t0:.1f}s)')
    V = taubin(V, F, it=4)
    Jd, Wd, label = skin_weights(S, V, F)
    print(f'[{sex}] skin weights done ({time.time()-t0:.1f}s)')
    Vd, Fd = decimate(V, F, target)
    print(f'[{sex}] decimated: {len(Vd)} verts {len(Fd)} tris ({time.time()-t0:.1f}s)')
    tree = cKDTree(V)
    _, nn = tree.query(Vd)
    J4, W4 = Jd[nn], Wd[nn]
    N = sdf_normals(S, Vd)
    # guard: SDF normal must agree with face orientation
    fn = np.cross(Vd[Fd[:, 1]] - Vd[Fd[:, 0]], Vd[Fd[:, 2]] - Vd[Fd[:, 0]])
    vn = np.zeros_like(Vd)
    for c in range(3):
        np.add.at(vn, Fd[:, c], fn)
    vn = nrm_rows(vn)
    agree = np.einsum('ij,ij->i', vn, N)
    if np.median(agree) < 0:
        Fd = Fd[:, ::-1].copy()
        vn = -vn
        agree = -agree
    bad = agree < 0.3
    N[bad] = vn[bad]
    AO = bake_ao(S, Vd, N)
    print(f'[{sex}] normals+AO ({time.time()-t0:.1f}s)  bad-normal fixes: {int(bad.sum())}')
    regions = muscle_regions(S, meta.get('regions_extra', []))
    os.makedirs(os.path.join(ROOT, 'models'), exist_ok=True)
    glb_path = os.path.join(ROOT, 'models', f'ironpulse-{sex}.glb')
    data = write_glb(glb_path, sex, Vd, N, J4, W4, AO, Fd, J, meta, regions, D)
    js_path = os.path.join(ROOT, 'assets', 'www', 'js', 'data', f'avatar-{sex}.js')
    with open(js_path, 'w') as fh:
        fh.write('/* IronPulse v3 avatar: glTF 2.0 binary (.glb) generated by tools/avatar/build.py - do not edit */\n')
        fh.write('(function(r){r.IronPulseAvatars=r.IronPulseAvatars||{};r.IronPulseAvatars.%s="%s";})(typeof window!=="undefined"?window:globalThis);\n'
                 % (sex, base64.b64encode(data).decode()))
    print(f'[{sex}] wrote {glb_path} ({len(data)/1024:.0f} KB) and {js_path}  total {time.time()-t0:.1f}s')


def regions_only(sex):
    """Fast path: re-generate only the muscle highlight table inside an existing GLB."""
    S, J, meta, D = build(sex)
    regions = muscle_regions(S, meta.get('regions_extra', []))
    glb_path = os.path.join(ROOT, 'models', f'ironpulse-{sex}.glb')
    raw = open(glb_path, 'rb').read()
    jl = struct.unpack('<I', raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jl])
    binchunk = raw[20 + jl:]
    gltf['skins'][0]['extras']['ironpulse']['regions'] = regions
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(binchunk)) + struct.pack('<II', len(js), 0x4E4F534A) + js + binchunk
    open(glb_path, 'wb').write(out)
    js_path = os.path.join(ROOT, 'assets', 'www', 'js', 'data', f'avatar-{sex}.js')
    with open(js_path, 'w') as fh:
        fh.write('/* IronPulse v3 avatar: glTF 2.0 binary (.glb) generated by tools/avatar/build.py - do not edit */\n')
        fh.write('(function(r){r.IronPulseAvatars=r.IronPulseAvatars||{};r.IronPulseAvatars.%s="%s";})(typeof window!=="undefined"?window:globalThis);\n'
                 % (sex, base64.b64encode(out).decode()))
    print(f'[{sex}] regions updated: {len(regions)}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--regions-only' in args:
        for sx in [a for a in args if a in ('male', 'female')] or ['male', 'female']:
            regions_only(sx)
        sys.exit(0)
    voxel = 0.0045
    target = 30000
    if '--voxel' in args:
        voxel = float(args[args.index('--voxel') + 1])
    if '--verts' in args:
        target = int(args[args.index('--verts') + 1])
    which = [a for a in args if a in ('male', 'female', 'all')] or ['all']
    sexes = ['male', 'female'] if which[0] == 'all' else which
    for sx in sexes:
        run(sx, voxel, target)
