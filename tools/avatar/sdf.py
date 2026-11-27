"""Signed-distance sculpting primitives for the IronPulse avatar pipeline.

Every primitive carries:
  * bone   – rig bone index used to seed skin weights (or a chain for limb cores)
  * muscle – anatomical muscle-group id used for the per-pixel highlight map
  * k      – smooth-union radius (small k = crisp muscle separation)
Evaluation is bbox-culled so a 4 mm grid over the whole body stays fast.
"""
import numpy as np


def nrm(v):
    v = np.asarray(v, dtype=np.float64)
    return v / (np.linalg.norm(v) + 1e-12)


def frame_from(a, fhint):
    """Orthonormal rows [a, f, c] with a = axis, f = hint orthogonalised, c = a x f."""
    a = nrm(a)
    f = np.asarray(fhint, dtype=np.float64)
    f = nrm(f - a * np.dot(a, f))
    c = np.cross(a, f)
    return np.stack([a, f, c])


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


class Prim:
    kind = 'none'

    def __init__(self, k=0.02, bone=0, muscle=0, region=None):
        self.k = k
        self.bone = bone
        self.muscle = muscle
        self.region = region  # optional override ellipsoid for highlight map

    def bbox(self):
        raise NotImplementedError

    def dist(self, p):
        raise NotImplementedError


class Ellipsoid(Prim):
    kind = 'ell'

    def __init__(self, c, R, r, **kw):
        super().__init__(**kw)
        self.c = np.asarray(c, dtype=np.float64)
        self.R = np.asarray(R, dtype=np.float64)  # rows = local axes in world
        self.r = np.asarray(r, dtype=np.float64)

    def bbox(self):
        ext = np.abs(self.R.T) @ self.r
        return self.c - ext, self.c + ext

    def local(self, p):
        return (p - self.c) @ self.R.T

    def dist(self, p):
        q = self.local(p)
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class RoundCone(Prim):
    kind = 'rcone'

    def __init__(self, a, b, r1, r2, **kw):
        super().__init__(**kw)
        self.a = np.asarray(a, dtype=np.float64)
        self.b = np.asarray(b, dtype=np.float64)
        self.r1 = float(r1)
        self.r2 = float(r2)

    def bbox(self):
        r = max(self.r1, self.r2)
        return np.minimum(self.a, self.b) - r, np.maximum(self.a, self.b) + r

    def dist(self, p):
        a, b, r1, r2 = self.a, self.b, self.r1, self.r2
        ba = b - a
        l2 = np.dot(ba, ba)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = p - a
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - np.outer(y, ba)
        x2 = np.einsum('ij,ij->i', xv, xv)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
        c1 = np.sign(z) * a2 * z2 > k
        d = np.where(c1, np.sqrt(x2 + z2) * il2 - r2, d)
        c2 = (~c1) & (np.sign(y) * a2 * y2 < k)
        d = np.where(c2, np.sqrt(x2 + y2) * il2 - r1, d)
        return d

    def seg_t(self, p):
        ba = self.b - self.a
        return np.clip(((p - self.a) @ ba) / np.dot(ba, ba), 0, 1)


class RoundBox(Prim):
    kind = 'rbox'

    def __init__(self, c, R, half, rad, **kw):
        super().__init__(**kw)
        self.c = np.asarray(c, dtype=np.float64)
        self.R = np.asarray(R, dtype=np.float64)
        self.h = np.asarray(half, dtype=np.float64)
        self.rad = float(rad)

    def bbox(self):
        ext = np.abs(self.R.T) @ (self.h + self.rad)
        return self.c - ext, self.c + ext

    def dist(self, p):
        q = np.abs((p - self.c) @ self.R.T) - self.h
        out = np.linalg.norm(np.maximum(q, 0), axis=1)
        ins = np.minimum(np.max(q, axis=1), 0)
        return out + ins - self.rad


class Sculpt:
    def __init__(self):
        self.prims = []
        self.mods = []  # (fn) applied after union: d = fn(p, d)

    def add(self, prim):
        self.prims.append(prim)
        return prim

    def eval(self, p, upto=None, chunk=400000):
        prims = self.prims if upto is None else self.prims[:upto]
        out = np.empty(len(p))
        for s in range(0, len(p), chunk):
            pp = p[s:s + chunk]
            d = np.full(len(pp), 1.0)
            for pr in prims:
                lo, hi = pr.bbox()
                m = pr.k + 0.012
                mask = np.all((pp >= lo - m) & (pp <= hi + m), axis=1)
                if not mask.any():
                    continue
                di = pr.dist(pp[mask])
                d[mask] = smin(d[mask], di, pr.k)
            for fn in self.mods:
                d = fn(pp, d)
            out[s:s + chunk] = d
        return out

    def raw_dists(self, p):
        """Per-primitive raw distances (inf outside bbox) -> (N, P)."""
        D = np.full((len(p), len(self.prims)), np.inf)
        for i, pr in enumerate(self.prims):
            lo, hi = pr.bbox()
            mask = np.all((p >= lo - 0.03) & (p <= hi + 0.03), axis=1)
            if mask.any():
                D[mask, i] = pr.dist(p[mask])
        return D

    def surface(self, origin, direction, upto=None, tmax=0.5):
        """Outermost surface point on the ray origin + t*direction (marches inward from outside)."""
        o = np.asarray(origin, dtype=np.float64)
        dv = nrm(direction)
        start = o + dv * tmax
        t = 0.0
        for _ in range(400):
            p = start - dv * t
            d = self.eval(p[None], upto=upto)[0]
            if d < 2e-4:
                return p
            t += min(max(d * 0.9, 3e-4), 0.01)
            if t > tmax:
                break
        return o
