"""Anatomical body definition for the IronPulse male & female avatars.

Coordinate system (glTF): +Y up, model faces +Z, character's LEFT side is +X.
Units: metres. Bind pose: relaxed A-pose (arms 40 deg from vertical, elbows soft).
"""
import numpy as np
from sdf import Sculpt, Ellipsoid, RoundCone, RoundBox, nrm, frame_from

BONES = [
    ('pelvis', -1), ('spine', 0), ('chest', 1), ('neck', 2), ('head', 3),
    ('clavicle_l', 2), ('upperarm_l', 5), ('lowerarm_l', 6), ('hand_l', 7), ('fingers_l', 8), ('fingertips_l', 9),
    ('clavicle_r', 2), ('upperarm_r', 11), ('lowerarm_r', 12), ('hand_r', 13), ('fingers_r', 14), ('fingertips_r', 15),
    ('thigh_l', 0), ('calf_l', 17), ('foot_l', 18),
    ('thigh_r', 0), ('calf_r', 20), ('foot_r', 21),
    ('toes_l', 19), ('toes_r', 22),
    ('thumb_l', 8), ('thumb_r', 14),
]
BI = {n: i for i, (n, _) in enumerate(BONES)}

MUSCLES = {
    'upper_chest': 1, 'mid_chest': 2, 'front_delts': 3, 'side_delts': 4, 'rear_delts': 5,
    'traps': 6, 'lats': 7, 'rhomboids': 8, 'lower_back': 9, 'biceps': 10, 'triceps': 11,
    'brachioradialis': 12, 'wrist_flexors': 13, 'pronators': 14, 'abs': 15, 'obliques': 16,
    'glutes': 17, 'quads': 18, 'hamstrings': 19, 'calves': 20,
}
M = MUSCLES

X = np.array([1.0, 0, 0]); Y = np.array([0, 1.0, 0]); Z = np.array([0, 0, 1.0])


def dims(sex):
    if sex == 'male':
        return dict(
            pelvis=(0, 0.965, 0.0), spine=(0, 1.075, -0.012), chest=(0, 1.255, -0.02),
            neck=(0, 1.505, -0.03), head=(0, 1.615, -0.008), top=(0, 1.80, -0.002),
            clav=(0.024, 1.47, 0.04), shoulder=(0.192, 1.455, -0.012),
            armA=40.0, elbowBend=12.0, L1=0.296, L2=0.258,
            hip=(0.094, 0.935, 0.0), knee=(0.114, 0.515, 0.014), ankle=(0.128, 0.09, -0.024),
            ball=(0.138, 0.024, 0.118), mass=1.0, fem=0.0,
        )
    return dict(
        pelvis=(0, 0.915, 0.0), spine=(0, 1.02, -0.012), chest=(0, 1.185, -0.02),
        neck=(0, 1.415, -0.028), head=(0, 1.515, -0.008), top=(0, 1.685, -0.002),
        clav=(0.02, 1.382, 0.036), shoulder=(0.158, 1.368, -0.012),
        armA=38.0, elbowBend=14.0, L1=0.274, L2=0.236,
        hip=(0.097, 0.887, 0.0), knee=(0.106, 0.487, 0.012), ankle=(0.116, 0.084, -0.022),
        ball=(0.124, 0.022, 0.106), mass=0.72, fem=1.0,
    )


def build(sex):
    D = dims(sex)
    m = D['mass']
    fem = D['fem']
    S = Sculpt()
    J = {}  # joint world positions
    meta = {'palm': {}, 'thumb': {}, 'hinge': {}, 'tail': {}}

    def mirror(v, s):
        v = np.array(v, dtype=np.float64)
        v[0] *= s
        return v

    for k in ('pelvis', 'spine', 'chest', 'neck', 'head', 'top'):
        J[k] = np.array(D[k], dtype=np.float64)

    # ------------------------------------------------------------------ joints
    for s, sd in ((1, 'l'), (-1, 'r')):
        J['clav_' + sd] = mirror(D['clav'], s)
        sh = mirror(D['shoulder'], s)
        J['shoulder_' + sd] = sh
        a = np.radians(D['armA'])
        u = nrm([s * np.sin(a), -np.cos(a), 0])
        b = np.radians(D['elbowBend'])
        fdir = nrm(np.cos(b) * u + np.sin(b) * Z)
        el = sh + u * D['L1']
        wr = el + fdir * D['L2']
        J['elbow_' + sd], J['wrist_' + sd] = el, wr
        n = nrm([-s * np.cos(a), -np.sin(a), 0])       # palm normal (faces thigh)
        n = nrm(n - fdir * np.dot(n, fdir))
        t = nrm(-s * np.cross(fdir, n))                 # thumb direction
        meta['palm'][sd], meta['thumb'][sd] = n, t
        hl = 0.088 * (0.93 if fem else 1.0)
        kn = wr + fdir * hl
        J['knuckle_' + sd] = kn
        J['pip_' + sd] = kn + fdir * 0.043 * (0.92 if fem else 1.0) + n * 0.006
        J['tip_' + sd] = J['pip_' + sd] + nrm(fdir + n * 0.35) * 0.046 * (0.92 if fem else 1.0)
        meta['hinge'][sd] = nrm(np.cross(u, fdir))
        J['hip_' + sd] = mirror(D['hip'], s)
        J['knee_' + sd] = mirror(D['knee'], s)
        J['ankle_' + sd] = mirror(D['ankle'], s)
        J['ball_' + sd] = mirror(D['ball'], s)
        J['toetip_' + sd] = J['ball_' + sd] + nrm([s * 0.1, 0, 1.0]) * (0.088 - 0.006 * fem) + np.array([0, -0.004, 0])

    surf = S.surface

    # ------------------------------------------------------------- torso base
    P, SP, CH, NK, HD = (J[k] for k in ('pelvis', 'spine', 'chest', 'neck', 'head'))
    wx = 1.0 - 0.1 * fem
    S.add(Ellipsoid(P + [0, -0.022, -0.01], np.eye(3), [0.148 + 0.007 * fem, 0.1, 0.1 + 0.006 * fem], k=0.05, bone=BI['pelvis']))
    S.add(Ellipsoid(SP + [0, -0.005, 0.0], np.eye(3), [0.116 * (1 - 0.06 * fem), 0.135, 0.088 - 0.004 * fem], k=0.05, bone=BI['spine']))
    S.add(Ellipsoid(CH + [0, 0.05, 0.004], np.eye(3), [0.134 * (1 - 0.08 * fem), 0.19, 0.104 - 0.008 * fem], k=0.05, bone=BI['chest']))
    S.add(Ellipsoid(CH + [0, 0.165, -0.006], np.eye(3), [0.152 * (1 - 0.1 * fem), 0.085, 0.09 - 0.01 * fem], k=0.045, bone=BI['chest']))
    S.add(RoundCone(NK + [0, -0.04, 0.0], HD + [0, 0.05, 0.004], 0.06 - 0.008 * fem, 0.05 - 0.006 * fem, k=0.03, bone=BI['neck']))
    nbase = len(S.prims)

    # ------------------------------------------------------------------- head
    hs = 1.0 - 0.06 * fem
    HC = HD + np.array([0, 0.095, 0.0]) * hs
    S.add(Ellipsoid(HC + [0, 0.008, -0.012], np.eye(3), np.array([0.077, 0.098, 0.096]) * hs, k=0.02, bone=BI['head']))
    S.add(Ellipsoid(HC + [0, -0.045, 0.032], np.eye(3), np.array([0.062, 0.072, 0.072]) * hs, k=0.03, bone=BI['head']))
    S.add(Ellipsoid(HC + [0, -0.088, 0.04], np.eye(3), np.array([0.05 - 0.006 * fem, 0.03, 0.055]) * hs, k=0.025, bone=BI['head']))
    S.add(Ellipsoid(HC + [0, -0.104, 0.078], np.eye(3), np.array([0.021, 0.018, 0.017]) * hs, k=0.018, bone=BI['head']))
    S.add(Ellipsoid(HC + [0, 0.0, 0.074], np.eye(3), np.array([0.054, 0.012, 0.02]) * hs, k=0.014, bone=BI['head']))
    S.add(Ellipsoid(HC + [0, -0.035, 0.094], frame_from([0, 1, 0.25], Z), np.array([0.024, 0.01, 0.012]) * hs, k=0.01, bone=BI['head']))
    for s in (1, -1):
        S.add(Ellipsoid(HC + [s * 0.041, -0.03, 0.066], np.eye(3), np.array([0.02, 0.013, 0.013]) * hs, k=0.014, bone=BI['head']))
        S.add(Ellipsoid(HC + [s * 0.075, -0.035, -0.012], frame_from([0, 1, -0.2], [s, 0, 0]), np.array([0.027, 0.009, 0.017]) * hs, k=0.008, bone=BI['head']))
        S.add(RoundCone(HD + [s * 0.045, 0.01, -0.02], NK + [s * 0.014, -0.025, 0.055], 0.012, 0.011, k=0.015, bone=BI['neck']))
    if fem:
        S.add(Ellipsoid(HC + [0, 0.014, -0.018], np.eye(3), np.array([0.082, 0.098, 0.098]) * hs, k=0.006, bone=BI['head']))
        S.add(Ellipsoid(HC + [0, 0.015, -0.098], np.eye(3), [0.026, 0.026, 0.022], k=0.012, bone=BI['head']))
        S.add(RoundCone(HC + [0, 0.012, -0.112], HC + [0, -0.085, -0.135], 0.024, 0.026, k=0.02, bone=BI['head']))
        S.add(RoundCone(HC + [0, -0.085, -0.135], HC + [0, -0.205, -0.112], 0.026, 0.011, k=0.03, bone=BI['head']))

    # ------------------------------------------------------- torso musculature
    for s, sd in ((1, 'l'), (-1, 'r')):
        cl = J['clav_' + sd]
        sh = J['shoulder_' + sd]
        S.add(RoundCone(cl + [0, 0, 0.004], sh + [-s * 0.02, 0.012, 0.03], 0.011, 0.012, k=0.02, bone=BI['clavicle_' + sd]))
        # latissimus dorsi: tapering wing from armpit to lumbar fascia (V-taper)
        S.add(RoundCone(CH + [s * 0.128, 0.105, -0.035], SP + [s * 0.07, 0.0, -0.05], 0.046 * (0.8 + 0.2 * m), 0.024, k=0.035, bone=BI['chest'], muscle=M['lats'])).chain = (BI['chest'], BI['spine'], 0.75)
        # pectoralis major: broad slab, soft clavicular blend, crisp lower border
        pc = surf(CH + [s * 0.094, 0.118 - 0.008 * fem, 0.0], Z, upto=nbase) - Z * (0.02 - 0.006 * fem)
        R = frame_from([s * 1.0, 0.32, 0.05], [0, -0.05, 1])
        S.add(Ellipsoid(pc, R, [0.096 * (1 - 0.12 * fem), 0.058 * (1 - 0.1 * fem), 0.034 * m + 0.004], k=0.01, bone=BI['chest'], muscle=M['mid_chest']))
        upc = surf(CH + [s * 0.08, 0.16 - 0.01 * fem, 0.0], Z, upto=nbase) - Z * 0.028
        S.add(Ellipsoid(upc, frame_from([s * 1.0, -0.08, 0.05], Z), [0.085, 0.042, 0.032 * m + 0.006], k=0.03, bone=BI['chest'], muscle=M['upper_chest']))
        S.add(RoundCone(pc + [s * 0.055, 0.025, -0.012], sh + [s * 0.0, -0.025, 0.035], 0.024 * m + 0.006, 0.022, k=0.02, bone=BI['chest'], muscle=M['mid_chest'])).chain = (BI['chest'], BI['upperarm_' + sd], 0.65)
        # external obliques
        dv = nrm([s, 0, 0.35])
        op = surf(SP + [0, -0.01, 0.02], dv, upto=nbase)
        S.add(Ellipsoid(op - dv * 0.034 + Y * 0.03, frame_from([s * 0.25, 1, 0.1], dv), [0.085, 0.036 * m + 0.01, 0.042], k=0.03, bone=BI['spine'], muscle=M['obliques']))
        # teres / infraspinatus
        ip = surf(CH + [s * 0.078, 0.105, 0.0], -Z, upto=nbase) + Z * 0.012
        S.add(Ellipsoid(ip, frame_from([s * 1, 0.2, 0], -Z), [0.055, 0.038, 0.014 * m + 0.004], k=0.028, bone=BI['chest'], muscle=M['rhomboids']))
        # upper trapezius
        S.add(RoundCone(NK + [s * 0.032, 0.045 - 0.01 * fem, -0.015], sh + [-s * 0.035, 0.03, -0.018], 0.03 * m + 0.006, 0.02, k=0.024, bone=BI['chest'], muscle=M['traps'])).chain = (BI['chest'], BI['clavicle_' + sd], 0.55)
        # erector spinae columns
        e0 = surf(P + [s * 0.032, 0.04, 0.0], -Z, upto=nbase) + Z * 0.01
        e1 = surf(CH + [s * 0.028, 0.02, 0.0], -Z, upto=nbase) + Z * 0.01
        S.add(RoundCone(e0, e1, 0.022 * (0.7 + 0.3 * m), 0.013, k=0.02, bone=BI['spine'], muscle=M['lower_back'])).chain = (BI['spine'], BI['chest'], 0.7)
        # glutes
        gp = P + [s * 0.072, -0.075 + 0.005 * fem, -0.056 - 0.006 * fem]
        S.add(Ellipsoid(gp, frame_from([s * 0.3, 1, 0], -Z), [0.09 + 0.004 * fem, 0.083 + 0.012 * fem, 0.068 + 0.014 * fem], k=0.026, bone=BI['pelvis'], muscle=M['glutes']))
        # rectus abdominis pads
        rows = (1.268, 1.193, 1.118, 1.03) if not fem else (1.205, 1.135, 1.065, 0.985)
        for i, yy in enumerate(rows):
            ap = surf([s * 0.031, yy, 0.0], Z, upto=nbase)
            nz = nrm(surf([s * 0.031, yy + 0.01, 0.0], Z, upto=nbase) - surf([s * 0.031, yy - 0.01, 0.0], Z, upto=nbase))
            Ra = frame_from(nz, Z)
            Ra = np.stack([np.cross(Ra[0], Ra[1]) * s, Ra[0], Ra[1]])
            prot = ((0.0085 if i < 3 else 0.004) * m + 0.002) * (1 - 0.45 * fem)
            half = [0.012, 0.016 if i < 3 else 0.026, 0.001]
            S.add(RoundBox(ap - Ra[2] * (0.0145 - prot), Ra, half, 0.0145, k=0.01 + 0.008 * fem, bone=BI['spine'] if i > 0 else BI['chest'], muscle=M['abs']))
        if fem:
            bc = surf(CH + [s * 0.068, 0.072, 0.0], Z, upto=nbase) - Z * 0.02
            S.add(Ellipsoid(bc, frame_from([s * 0.25, 1, 0], nrm([s * 0.3, -0.1, 1])), [0.06, 0.062, 0.058], k=0.03, bone=BI['chest'], muscle=0))
    # mid / lower trapezius (flat diamond)
    tp = surf(CH + [0, 0.12, 0], -Z, upto=nbase) + Z * 0.02
    S.add(Ellipsoid(tp, np.eye(3), [0.058, 0.11, 0.01 * m + 0.004], k=0.035, bone=BI['chest'], muscle=M['traps']))
    if fem:
        bb = surf(CH + [0, 0.078, 0], Z, upto=nbase)
        S.add(Ellipsoid(bb - Z * 0.036, np.eye(3), [0.1, 0.048, 0.058], k=0.03, bone=BI['chest']))

    # -------------------------------------------------------------------- arms
    for s, sd in ((1, 'l'), (-1, 'r')):
        sh, el, wr = J['shoulder_' + sd], J['elbow_' + sd], J['wrist_' + sd]
        UA, FA, HA, F1, F2 = (BI[n + '_' + sd] for n in ('upperarm', 'lowerarm', 'hand', 'fingers', 'fingertips'))
        u = nrm(el - sh)
        fa = nrm(wr - el)
        Ru = frame_from(u, Z)                       # rows: along, front, (a x f)
        lat_u = -s * Ru[2]                          # outward
        fu = Ru[1]
        L1, L2 = D['L1'], D['L2']

        def onU(t, of=0.0, ol=0.0):
            return sh + u * L1 * t + fu * of + lat_u * ol
        S.add(RoundCone(sh + u * 0.02, el, 0.05 * (0.82 + 0.18 * m), 0.035, k=0.035, bone=UA))
        S.add(Ellipsoid(sh + Y * 0.006 + lat_u * 0.004, np.eye(3), [0.052, 0.05, 0.05], k=0.03, bone=UA))
        # deltoid heads
        S.add(Ellipsoid(onU(0.12, 0.034, 0.002), np.stack([u, fu, np.cross(u, fu)]), [0.072, 0.03 * m + 0.008, 0.034], k=0.016, bone=UA, muscle=M['front_delts']))
        S.add(Ellipsoid(onU(0.13, 0.0, 0.03), np.stack([u, fu, np.cross(u, fu)]), [0.078, 0.036, 0.028 * m + 0.008], k=0.016, bone=UA, muscle=M['side_delts']))
        S.add(Ellipsoid(onU(0.12, -0.032, 0.004), np.stack([u, fu, np.cross(u, fu)]), [0.07, 0.028 * m + 0.008, 0.032], k=0.016, bone=UA, muscle=M['rear_delts']))
        # biceps / brachialis / triceps
        S.add(Ellipsoid(onU(0.56, 0.026, -0.004), np.stack([u, fu, np.cross(u, fu)]), [0.115, 0.038 * m + 0.008, 0.033], k=0.014, bone=UA, muscle=M['biceps']))
        S.add(Ellipsoid(onU(0.7, 0.008, 0.022), np.stack([u, fu, np.cross(u, fu)]), [0.07, 0.022, 0.02], k=0.014, bone=UA, muscle=M['biceps']))
        S.add(Ellipsoid(onU(0.42, -0.028, -0.008), np.stack([u, fu, np.cross(u, fu)]), [0.14, 0.038 * m + 0.008, 0.035], k=0.014, bone=UA, muscle=M['triceps']))
        S.add(Ellipsoid(onU(0.36, -0.018, 0.022), np.stack([u, fu, np.cross(u, fu)]), [0.1, 0.03 * m + 0.006, 0.03], k=0.014, bone=UA, muscle=M['triceps']))
        # forearm
        n, t = meta['palm'][sd], meta['thumb'][sd]

        def onF(tt, on=0.0, ot=0.0):
            return el + fa * L2 * tt + n * on + t * ot
        Rf = np.stack([fa, n, np.cross(fa, n)])
        S.add(Ellipsoid(el - fa * 0.004, np.eye(3), [0.036, 0.036, 0.036], k=0.03, bone=FA))
        S.add(RoundCone(el + fa * 0.02, wr - fa * 0.02, 0.036 * (0.85 + 0.15 * m), 0.022, k=0.03, bone=FA))
        S.add(Ellipsoid(onF(0.24, -0.004, 0.022), Rf, [0.1, 0.024, 0.024 * m + 0.008], k=0.014, bone=FA, muscle=M['brachioradialis']))
        S.add(Ellipsoid(onF(0.3, 0.018, -0.006), Rf, [0.12, 0.022 * m + 0.008, 0.026], k=0.014, bone=FA, muscle=M['wrist_flexors']))
        S.add(Ellipsoid(onF(0.3, -0.018, -0.004), Rf, [0.12, 0.02 * m + 0.008, 0.024], k=0.014, bone=FA, muscle=0))
        S.add(Ellipsoid(onF(0.15, 0.012, -0.02), np.stack([nrm(fa + t * 0.5), n, np.cross(nrm(fa + t * 0.5), n)]), [0.06, 0.016, 0.016], k=0.012, bone=FA, muscle=M['pronators']))
        S.add(Ellipsoid(wr, Rf, [0.022, 0.016, 0.026], k=0.016, bone=FA))
        # hand
        hsx = 0.93 if fem else 1.0
        Rh = np.stack([fa, t, n])
        pc = wr + fa * 0.046 * hsx
        S.add(RoundBox(pc, Rh, np.array([0.036, 0.034, 0.007]) * hsx, 0.0115 * hsx, k=0.016, bone=HA))
        S.add(Ellipsoid(wr + fa * 0.03 * hsx + t * 0.022 * hsx + n * 0.012, Rh, np.array([0.03, 0.017, 0.014]) * hsx, k=0.012, bone=HA))
        kn = J['knuckle_' + sd]
        fingers = ((0.026, 0.043, 0.026, 0.021, 1.0), (0.009, 0.047, 0.029, 0.022, 1.04),
                   (-0.009, 0.044, 0.027, 0.021, 0.98), (-0.025, 0.035, 0.021, 0.019, 0.86))
        for off, l1, l2, l3, rs in fingers:
            rs *= hsx
            b0 = kn + t * off * hsx - fa * 0.006
            d1 = nrm(fa + n * 0.12)
            p1 = b0 + d1 * l1 * hsx
            d2 = nrm(fa + n * 0.42)
            p2 = p1 + d2 * l2 * hsx
            d3 = nrm(fa + n * 0.75)
            p3 = p2 + d3 * l3 * hsx
            S.add(RoundCone(b0, p1, 0.0098 * rs, 0.0088 * rs, k=0.004, bone=F1))
            S.add(RoundCone(p1, p2, 0.0088 * rs, 0.008 * rs, k=0.003, bone=F2))
            S.add(RoundCone(p2, p3, 0.008 * rs, 0.0068 * rs, k=0.003, bone=F2))
        # thumb
        TH = BI['thumb_' + sd]
        tb = wr + fa * 0.018 * hsx + t * 0.028 * hsx + n * 0.006
        td = nrm(fa * 0.6 + t * 0.62 + n * 0.2)
        t1 = tb + td * 0.042 * hsx
        td2 = nrm(fa * 0.82 + t * 0.2 + n * 0.3)
        t2 = t1 + td2 * 0.03 * hsx
        t3 = t2 + nrm(fa * 0.78 - t * 0.02 + n * 0.42) * 0.024 * hsx
        J['thumb_' + sd], J['thumbtip_' + sd] = tb, t3
        S.add(RoundCone(tb, t1, 0.0135 * hsx, 0.0105 * hsx, k=0.008, bone=TH))
        S.add(RoundCone(t1, t2, 0.0102 * hsx, 0.0092 * hsx, k=0.004, bone=TH))
        S.add(RoundCone(t2, t3, 0.009 * hsx, 0.0075 * hsx, k=0.004, bone=TH))

    # -------------------------------------------------------------------- legs
    for s, sd in ((1, 'l'), (-1, 'r')):
        hp, kn, an, bl = J['hip_' + sd], J['knee_' + sd], J['ankle_' + sd], J['ball_' + sd]
        TH, CA, FO = (BI[n + '_' + sd] for n in ('thigh', 'calf', 'foot'))
        a = nrm(kn - hp)
        R = frame_from(a, Z)
        f = R[1]
        lat = -s * R[2]
        Lt = np.linalg.norm(kn - hp)

        def onT(tt, of=0.0, ol=0.0):
            return hp + a * Lt * tt + f * of + lat * ol
        Rt = np.stack([a, f, np.cross(a, f)])
        S.add(RoundCone(hp + a * 0.03 + lat * 0.008, kn + a * -0.01, 0.088 + 0.004 * fem, 0.052, k=0.04, bone=TH))
        S.add(Ellipsoid(onT(0.44, 0.04, 0.004), Rt, [0.19, 0.046 * m + 0.01, 0.046], k=0.016, bone=TH, muscle=M['quads']))
        S.add(Ellipsoid(onT(0.5, 0.012, 0.044), Rt, [0.2, 0.042, 0.046 * m + 0.012], k=0.016, bone=TH, muscle=M['quads']))
        S.add(Ellipsoid(onT(0.8, 0.026, -0.032), Rt, [0.085, 0.04 * m + 0.008, 0.04], k=0.014, bone=TH, muscle=M['quads']))
        S.add(Ellipsoid(onT(0.32, -0.004, -0.04), Rt, [0.15, 0.04, 0.028], k=0.02, bone=TH, muscle=0))
        S.add(Ellipsoid(onT(0.5, -0.042, 0.016), Rt, [0.18, 0.038 * m + 0.012, 0.036], k=0.016, bone=TH, muscle=M['hamstrings']))
        S.add(Ellipsoid(onT(0.52, -0.04, -0.022), Rt, [0.17, 0.036 * m + 0.01, 0.032], k=0.016, bone=TH, muscle=M['hamstrings']))
        S.add(Ellipsoid(onT(0.1, 0.02, 0.06), Rt, [0.07, 0.026, 0.022], k=0.02, bone=TH, muscle=0))
        # knee & patella
        S.add(Ellipsoid(kn, np.eye(3), [0.05, 0.05, 0.048], k=0.03, bone=CA))
        S.add(Ellipsoid(kn + f * 0.04 + a * -0.008, Rt, [0.024, 0.014, 0.022], k=0.012, bone=CA))
        # shin & calf
        a2 = nrm(an - kn)
        R2 = frame_from(a2, Z)
        f2 = R2[1]
        lat2 = -s * R2[2]
        Ls = np.linalg.norm(an - kn)
        Rs = np.stack([a2, f2, np.cross(a2, f2)])

        def onS(tt, of=0.0, ol=0.0):
            return kn + a2 * Ls * tt + f2 * of + lat2 * ol
        S.add(RoundCone(kn + a2 * 0.02, an - a2 * 0.0, 0.048, 0.03, k=0.03, bone=CA))
        S.add(Ellipsoid(onS(0.27, -0.038, -0.016), Rs, [0.12, 0.042 * m + 0.008, 0.036], k=0.014, bone=CA, muscle=M['calves']))
        S.add(Ellipsoid(onS(0.25, -0.034, 0.02), Rs, [0.105, 0.036 * m + 0.007, 0.032], k=0.014, bone=CA, muscle=M['calves']))
        S.add(Ellipsoid(onS(0.52, -0.022, 0.0), Rs, [0.15, 0.024, 0.032], k=0.02, bone=CA, muscle=M['calves']))
        S.add(Ellipsoid(onS(0.36, 0.024, 0.014), Rs, [0.15, 0.016, 0.017], k=0.016, bone=CA, muscle=0))
        # sneaker: cupsole + rounded upper + toe box + heel counter + collar
        toe = nrm(np.array([s * 0.1, 0, 1.0]))
        Rfo = np.stack([toe, Y, np.cross(toe, Y)])
        fl = 1.0 - 0.07 * fem
        heel = an + np.array([0, -an[1], 0]) - toe * 0.075 * fl
        cen = heel + toe * 0.145 * fl
        TO = BI['toes_' + sd]
        ballP = J['ball_' + sd]
        nf = len(S.prims)
        S.add(RoundBox(cen + Y * 0.0135, Rfo, np.array([0.136, 0.007, 0.041]) * [fl, 1, fl], 0.0095, k=0.004, bone=FO))
        S.add(Ellipsoid(cen + Y * 0.05 - toe * 0.03 * fl, Rfo, np.array([0.128, 0.05, 0.047]) * [fl, 1, fl], k=0.016, bone=FO))
        S.add(Ellipsoid(cen + Y * 0.04 + toe * 0.08 * fl, Rfo, np.array([0.068, 0.034, 0.046]) * [fl, 1, fl], k=0.02, bone=FO))
        S.add(Ellipsoid(heel + toe * 0.04 * fl + Y * 0.062, Rfo, np.array([0.05, 0.052, 0.044]) * [fl, 1, fl], k=0.02, bone=FO))
        S.add(Ellipsoid(an + Y * 0.008 - toe * 0.005, Rfo, [0.045, 0.034, 0.042], k=0.02, bone=FO))
        for pr in S.prims[nf:]:
            pr.split = (FO, TO, ballP - toe * 0.004, toe)

    # ------------------------------------------------- clothing (geometric hem)
    shortTop = P[1] + 0.035 + 0.03 * fem
    shortBot = J['knee_l'][1] + (0.27 - 0.06 * fem) * (P[1] - J['knee_l'][1])
    braTop = CH[1] + 0.145
    braBot = CH[1] + 0.0

    def cloth(p, d):
        y = p[:, 1]
        ax = np.abs(p[:, 0])
        w = 0.0025
        sh_m = (1 / (1 + np.exp(-(y - shortBot) / w * 2.2))) * (1 / (1 + np.exp((y - shortTop) / w * 2.2))) * (ax < 0.26)
        d = d - 0.0032 * sh_m
        if fem:
            br = (1 / (1 + np.exp(-(y - braBot) / w * 2.2))) * (1 / (1 + np.exp((y - braTop) / w * 2.2))) * (ax < 0.15) * (y < braTop + 0.03)
            d = d - 0.0024 * br
        sole = 1 / (1 + np.exp((y - 0.026) / 0.0015))
        d = d - 0.0022 * sole * (y > -1)
        return d
    S.mods.append(cloth)

    # highlight-only coverage shapes (not sculpted): broad anatomical areas for the muscle map
    ex = []
    for s, sd in ((1, 'l'),):
        ex.append(Ellipsoid(CH + [0.1, 0.035, -0.07], frame_from([0.42, 1, 0.05], [0.5, 0, -1]), [0.15, 0.03, 0.06], muscle=M['lats']))
        ex.append(Ellipsoid(CH + [0.085, 0.115, 0.075], frame_from([1, 0.25, 0.05], Z), [0.1, 0.065, 0.03], muscle=M['mid_chest']))
        ex.append(Ellipsoid(CH + [0.07, 0.172, 0.06], frame_from([1, -0.1, 0.1], Z), [0.08, 0.025, 0.03], muscle=M['upper_chest']))
        ex.append(Ellipsoid(SP + [0.105, 0.03, 0.04], frame_from([0.2, 1, 0.1], [1, 0, 0.3]), [0.09, 0.03, 0.05], muscle=M['obliques']))
        ex.append(Ellipsoid(CH + [0.0, 0.13, -0.09], np.eye(3), [0.075, 0.115, 0.03], muscle=M['traps']))
    meta['regions_extra'] = ex
    meta['clothing'] = dict(shortTop=float(shortTop), shortBot=float(shortBot), braTop=float(braTop), braBot=float(braBot),
                            shoeTop=float(J['ankle_l'][1] + 0.005), soleTop=0.026)
    return S, J, meta, D


def bone_heads_tails(J):
    H, T = {}, {}
    H['pelvis'], T['pelvis'] = J['pelvis'], J['spine']
    H['spine'], T['spine'] = J['spine'], J['chest']
    H['chest'], T['chest'] = J['chest'], J['neck']
    H['neck'], T['neck'] = J['neck'], J['head']
    H['head'], T['head'] = J['head'], J['top']
    for sd in ('l', 'r'):
        H['clavicle_' + sd], T['clavicle_' + sd] = J['clav_' + sd], J['shoulder_' + sd]
        H['upperarm_' + sd], T['upperarm_' + sd] = J['shoulder_' + sd], J['elbow_' + sd]
        H['lowerarm_' + sd], T['lowerarm_' + sd] = J['elbow_' + sd], J['wrist_' + sd]
        H['hand_' + sd], T['hand_' + sd] = J['wrist_' + sd], J['knuckle_' + sd]
        H['fingers_' + sd], T['fingers_' + sd] = J['knuckle_' + sd], J['pip_' + sd]
        H['fingertips_' + sd], T['fingertips_' + sd] = J['pip_' + sd], J['tip_' + sd]
        H['thigh_' + sd], T['thigh_' + sd] = J['hip_' + sd], J['knee_' + sd]
        H['calf_' + sd], T['calf_' + sd] = J['knee_' + sd], J['ankle_' + sd]
        H['foot_' + sd], T['foot_' + sd] = J['ankle_' + sd], J['ball_' + sd]
        H['toes_' + sd], T['toes_' + sd] = J['ball_' + sd], J['toetip_' + sd]
        H['thumb_' + sd], T['thumb_' + sd] = J['thumb_' + sd], J['thumbtip_' + sd]
    return H, T
