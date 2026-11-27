(function () {
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      var rad = typeof r === 'number' ? r : 0;
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
      return this;
    };
  }
})();

(function (root) {
  'use strict';

  var PAL = {
    skinHi: '#E8C5AD',
    skinMid: '#D0A185',
    skinLo: '#9B6C52',
    ink: '#1C1410',
    shortsHi: '#2E3442',
    shortsMid: '#1C2029',
    shortsLo: '#101318',
    shoeHi: '#3A4150',
    shoeMid: '#232833',
    shoeSole: '#E2E8F0',
    priHi: '#FF5660',
    priMid: '#D91E32',
    priLo: '#870D1B',
    secHi: '#E27A6C',
    secMid: '#C6483D',
    secLo: '#852D26',
    steelHi: '#E2E8F0',
    steelMid: '#94A3B8',
    steelLo: '#475569',
    plateHi: '#3B4252',
    plateMid: '#1E222B',
    plateLo: '#0F1218'
  };

  function muscleState(ids, exercise) {
    if (!exercise) return 'none';
    if (ids.some(function (m) { return exercise.primary.indexOf(m) !== -1; })) return 'primary';
    if (ids.some(function (m) { return exercise.secondary.indexOf(m) !== -1; })) return 'secondary';
    return 'none';
  }

  // Organic anatomical limb with natural skin shading + optional anatomical crimson muscle fiber overlay
  function drawAthleticLimb(ctx, x1, y1, x2, y2, rStart, rBelly, rEnd, bellyPos, mState, pulse, isShortsUpper) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    var bx = x1 + dx * bellyPos;
    var by = y1 + dy * bellyPos;

    function buildLimbPath() {
      ctx.beginPath();
      ctx.moveTo(x1 + nx * rStart, y1 + ny * rStart);
      ctx.quadraticCurveTo(bx + nx * rBelly * 1.12, by + ny * rBelly * 1.12, x2 + nx * rEnd, y2 + ny * rEnd);
      ctx.arc(x2, y2, rEnd, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
      ctx.quadraticCurveTo(bx - nx * rBelly * 0.94, by - ny * rBelly * 0.94, x1 - nx * rStart, y1 - ny * rStart);
      ctx.arc(x1, y1, rStart, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
      ctx.closePath();
    }

    ctx.save();
    buildLimbPath();

    // Base natural athletic skin lighting
    var grad = ctx.createLinearGradient(bx + nx * rBelly, by + ny * rBelly, bx - nx * rBelly, by - ny * rBelly);
    grad.addColorStop(0, PAL.skinHi);
    grad.addColorStop(0.55, PAL.skinMid);
    grad.addColorStop(1, PAL.skinLo);
    ctx.fillStyle = grad;
    ctx.fill();

    // Overlay anatomical crimson muscle belly ONLY if targeted
    if (mState === 'primary' || mState === 'secondary') {
      ctx.save();
      ctx.clip();
      var alpha = mState === 'primary' ? (0.76 + pulse * 0.22) : (0.36 + pulse * 0.16);
      ctx.globalAlpha = alpha;
      var mg = ctx.createLinearGradient(bx + nx * rBelly, by + ny * rBelly, bx - nx * rBelly, by - ny * rBelly);
      mg.addColorStop(0, mState === 'primary' ? PAL.priHi : PAL.secHi);
      mg.addColorStop(0.55, mState === 'primary' ? PAL.priMid : PAL.secMid);
      mg.addColorStop(1, mState === 'primary' ? PAL.priLo : PAL.secLo);

      // Tapered anatomical muscle belly inset (leaves joints natural skin like medical illustration!)
      ctx.beginPath();
      ctx.ellipse(bx, by, len * 0.38, rBelly * 0.88, Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fillStyle = mg;
      ctx.fill();

      // Fine anatomical muscle fiber striations
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 0.9;
      [-0.35, 0, 0.35].forEach(function (off) {
        ctx.beginPath();
        ctx.moveTo(x1 + dx * 0.16 + nx * rBelly * off, y1 + dy * 0.16 + ny * rBelly * off);
        ctx.quadraticCurveTo(bx + nx * rBelly * (off * 1.15), by + ny * rBelly * (off * 1.15), x2 - dx * 0.16 + nx * rEnd * off, y2 - dy * 0.16 + ny * rEnd * off);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Athletic compression shorts sleeve covering upper 46% of thigh
    if (isShortsUpper) {
      ctx.save();
      ctx.clip();
      var sx2 = x1 + dx * 0.46;
      var sy2 = y1 + dy * 0.46;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * (rStart + 6), y1 + ny * (rStart + 6));
      ctx.lineTo(sx2 + nx * (rBelly + 5), sy2 + ny * (rBelly + 5));
      ctx.lineTo(sx2 - nx * (rBelly + 5), sy2 - ny * (rBelly + 5));
      ctx.lineTo(x1 - nx * (rStart + 6), y1 - ny * (rStart + 6));
      ctx.closePath();
      var sg = ctx.createLinearGradient(x1 + nx * rBelly, y1 + ny * rBelly, x1 - nx * rBelly, y1 - ny * rBelly);
      sg.addColorStop(0, PAL.shortsHi);
      sg.addColorStop(0.6, PAL.shortsMid);
      sg.addColorStop(1, PAL.shortsLo);
      ctx.fillStyle = sg;
      ctx.fill();
      // Shorts hem line
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx2 + nx * (rBelly + 2), sy2 + ny * (rBelly + 2));
      ctx.lineTo(sx2 - nx * (rBelly + 2), sy2 - ny * (rBelly + 2));
      ctx.stroke();
      ctx.restore();
    }

    // Clean studio ink contour
    buildLimbPath();
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    ctx.restore();
  }

  // Sculpted Athletic Mannequin Head (matching reference illustration cleanly)
  function drawHead(ctx, hx, hy, nx, ny, sex, scale, view) {
    var r = 15.5 * scale;
    var angle = Math.atan2(hy - ny, hx - nx) + Math.PI / 2;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle * 0.22);

    // Female sculpted athletic ponytail
    if (sex === 'female') {
      ctx.beginPath();
      if (view === 'side') {
        ctx.moveTo(-r * 0.72, -r * 0.28);
        ctx.quadraticCurveTo(-r * 1.65, -r * 0.35, -r * 1.50, r * 0.78);
        ctx.quadraticCurveTo(-r * 1.05, r * 0.38, -r * 0.80, r * 0.05);
      } else {
        ctx.moveTo(r * 0.52, -r * 0.58);
        ctx.quadraticCurveTo(r * 1.22, -r * 0.22, r * 1.00, r * 0.62);
        ctx.quadraticCurveTo(r * 0.68, r * 0.26, r * 0.48, -r * 0.14);
      }
      ctx.closePath();
      ctx.fillStyle = '#252020';
      ctx.fill();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.beginPath();
    var jawW = sex === 'female' ? r * 0.56 : r * 0.70;
    ctx.ellipse(0, -r * 0.14, r * 0.80, r * 0.90, 0, Math.PI, 0, false);
    ctx.quadraticCurveTo(r * 0.80, r * 0.56, jawW * 0.55, r * 0.96);
    ctx.quadraticCurveTo(0, r * 1.12, -jawW * 0.55, r * 0.96);
    ctx.quadraticCurveTo(-r * 0.80, r * 0.56, -r * 0.80, -r * 0.14);
    ctx.closePath();

    var hg = ctx.createLinearGradient(-r, -r, r, r);
    hg.addColorStop(0, PAL.skinHi);
    hg.addColorStop(0.62, PAL.skinMid);
    hg.addColorStop(1, PAL.skinLo);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.lineWidth = 1.35;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();

    // Subtle sculpted ear + cheek plane line (clean featureless mannequin aesthetic)
    ctx.strokeStyle = 'rgba(72, 42, 26, 0.30)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (view === 'side') {
      ctx.arc(-r * 0.12, r * 0.08, r * 0.18, 0.5, 4.2);
    } else {
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(0, r * 0.65);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFrontTorso(ctx, pts, sex, scale, exercise, p) {
    var lSh = pts.lSh, rSh = pts.rSh, chest = pts.chest, pel = pts.pelvis, neck = pts.neck;
    var isF = sex === 'female';
    var shW = Math.abs(rSh[0] - lSh[0]) * (isF ? 0.86 : 1.0);
    var waistW = shW * (isF ? 0.56 : 0.70);
    var hipW = shW * (isF ? 0.88 : 0.78);
    var cx = (lSh[0] + rSh[0]) / 2;

    // 1. Trapezius hood
    var trapSt = muscleState(['traps'], exercise);
    ctx.beginPath();
    ctx.moveTo(neck[0] - 8 * scale, neck[1] - 4 * scale);
    ctx.lineTo(neck[0] + 8 * scale, neck[1] - 4 * scale);
    ctx.lineTo(cx + shW * 0.50, rSh[1] + 2 * scale);
    ctx.lineTo(cx - shW * 0.50, lSh[1] + 2 * scale);
    ctx.closePath();
    ctx.fillStyle = trapSt === 'primary' ? PAL.priMid : trapSt === 'secondary' ? PAL.secMid : PAL.skinMid;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; ctx.stroke();

    // 2. Lats V-taper silhouette
    var latSt = muscleState(['lats', 'rhomboids'], exercise);
    ctx.beginPath();
    ctx.moveTo(cx - shW * 0.47, lSh[1] + 10 * scale);
    ctx.quadraticCurveTo(cx - shW * (isF ? 0.42 : 0.54), chest[1] + 12 * scale, cx - waistW * 0.50, pel[1] - 4 * scale);
    ctx.lineTo(cx + waistW * 0.50, pel[1] - 4 * scale);
    ctx.quadraticCurveTo(cx + shW * (isF ? 0.42 : 0.54), chest[1] + 12 * scale, cx + shW * 0.47, rSh[1] + 10 * scale);
    ctx.closePath();
    ctx.fillStyle = latSt === 'primary' ? PAL.priMid : latSt === 'secondary' ? PAL.secMid : PAL.skinLo;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; ctx.stroke();

    // 3. Main Torso Natural Skin
    ctx.beginPath();
    ctx.moveTo(cx - shW * 0.46, lSh[1] + 4 * scale);
    ctx.lineTo(cx + shW * 0.46, rSh[1] + 4 * scale);
    ctx.quadraticCurveTo(cx + waistW * 0.52, (chest[1] + pel[1]) * 0.55, cx + hipW * 0.50, pel[1] + 6 * scale);
    ctx.lineTo(cx, pel[1] + 18 * scale);
    ctx.lineTo(cx - hipW * 0.50, pel[1] + 6 * scale);
    ctx.quadraticCurveTo(cx - waistW * 0.52, (chest[1] + pel[1]) * 0.55, cx - shW * 0.46, lSh[1] + 4 * scale);
    ctx.closePath();
    var tg = ctx.createLinearGradient(cx - shW * 0.5, chest[1], cx + shW * 0.5, chest[1]);
    tg.addColorStop(0, PAL.skinHi);
    tg.addColorStop(0.55, PAL.skinMid);
    tg.addColorStop(1, PAL.skinLo);
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.35; ctx.stroke();

    // 4. Sculpted Pectorals with Anatomical Crimson Fiber Overlay (when active)
    var pecSt = muscleState(['upper_chest', 'mid_chest'], exercise);
    var pecH = (isF ? 20 : 23) * scale;
    var pecW = shW * 0.44;
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 2 * scale, lSh[1] + 5 * scale);
      ctx.lineTo(cx + side * pecW, lSh[1] + 8 * scale);
      ctx.quadraticCurveTo(cx + side * (pecW * 0.92), lSh[1] + pecH, cx + side * 2.5 * scale, lSh[1] + pecH * 0.96);
      ctx.closePath();
      if (pecSt === 'primary' || pecSt === 'secondary') {
        var pg = ctx.createLinearGradient(cx, lSh[1], cx + side * pecW, lSh[1] + pecH);
        pg.addColorStop(0, pecSt === 'primary' ? (p > 0.45 ? PAL.priHi : PAL.priMid) : PAL.secHi);
        pg.addColorStop(1, pecSt === 'primary' ? PAL.priLo : PAL.secLo);
        ctx.fillStyle = pg;
        ctx.fill();
        // Fan-shaped pec striations
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 0.85;
        for (var f = 0; f < 4; f++) {
          ctx.beginPath();
          ctx.moveTo(cx + side * 2 * scale, lSh[1] + (7 + f * 4) * scale);
          ctx.lineTo(cx + side * pecW, lSh[1] + (10 + f * 2.5) * scale);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(130, 82, 58, 0.14)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(42, 24, 16, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    });

    // Female charcoal athletic sports top (leaves upper chest & abs clearly readable)
    if (isF) {
      ctx.beginPath();
      ctx.moveTo(cx - shW * 0.40, lSh[1] + 9 * scale);
      ctx.lineTo(cx + shW * 0.40, rSh[1] + 9 * scale);
      ctx.lineTo(cx + waistW * 0.56, lSh[1] + pecH + 5 * scale);
      ctx.lineTo(cx - waistW * 0.56, lSh[1] + pecH + 5 * scale);
      ctx.closePath();
      ctx.fillStyle = pecSt === 'primary' ? 'rgba(28, 32, 41, 0.58)' : 'rgba(28, 32, 41, 0.92)';
      ctx.fill();
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.1; ctx.stroke();
    }

    // 5. Sculpted Abs & Obliques
    var absSt = muscleState(['abs'], exercise);
    var obSt = muscleState(['obliques'], exercise);
    var abTop = lSh[1] + pecH + 6 * scale;
    var abBot = pel[1] - 2 * scale;
    var rowH = (abBot - abTop) / 3.1;
    var abW = waistW * 0.24;
    for (var row = 0; row < 3; row++) {
      var ry = abTop + row * rowH;
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.roundRect(cx + (side < 0 ? -abW - 1.5 : 1.5), ry, abW, rowH * 0.78, 3);
        ctx.fillStyle = absSt === 'primary' ? (p > 0.45 ? PAL.priHi : PAL.priMid)
          : absSt === 'secondary' ? PAL.secMid : 'rgba(128, 82, 56, 0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(55, 32, 20, 0.28)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      });
    }
    if (obSt === 'primary' || obSt === 'secondary') {
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(cx + side * waistW * 0.38, (abTop + abBot) * 0.5, waistW * 0.12, (abBot - abTop) * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = obSt === 'primary' ? PAL.priMid : PAL.secMid;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    // 6. Dark Athletic Gym Shorts Pelvis Band
    ctx.beginPath();
    ctx.moveTo(cx - hipW * 0.50, pel[1] - 3 * scale);
    ctx.lineTo(cx + hipW * 0.50, pel[1] - 3 * scale);
    ctx.lineTo(cx + hipW * 0.54, pel[1] + 15 * scale);
    ctx.lineTo(cx, pel[1] + 19 * scale);
    ctx.lineTo(cx - hipW * 0.54, pel[1] + 15 * scale);
    ctx.closePath();
    ctx.fillStyle = PAL.shortsMid;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.3; ctx.stroke();
    // Waistband highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - hipW * 0.48, pel[1] - 1 * scale);
    ctx.lineTo(cx + hipW * 0.48, pel[1] - 1 * scale);
    ctx.stroke();
  }

  function drawSideTorso(ctx, pts, sex, scale, exercise, p) {
    var sh = pts.sh, ch = pts.chest, pel = pts.pelvis;
    var isF = sex === 'female';
    var chestSt = muscleState(['mid_chest', 'upper_chest'], exercise);
    var backSt = muscleState(['lats', 'rhomboids', 'lower_back'], exercise);
    var absSt = muscleState(['abs', 'obliques'], exercise);
    var gluteSt = muscleState(['glutes'], exercise);

    var dx = pel[0] - sh[0];
    var dy = pel[1] - sh[1];
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var fx = uy, fy = -ux;
    if (fx < 0 && pts.head[0] >= pel[0]) { fx = -fx; fy = -fy; }

    var chestD = (isF ? 16 : 19) * scale;
    var waistD = (isF ? 11.5 : 14) * scale;
    var backD = (isF ? 12.5 : 15) * scale;

    // Back / Lat muscle contour (natural skin unless back is active)
    drawAthleticLimb(
      ctx,
      sh[0] - fx * 3 * scale, sh[1] - fy * 3 * scale,
      pel[0] - fx * 2 * scale, pel[1] - fy * 2 * scale,
      backD * 0.85, backD * 1.02, waistD * 0.80, 0.35,
      backSt, p, false
    );

    // Front abdominal wall (natural skin unless abs are active)
    drawAthleticLimb(
      ctx,
      ch[0] + fx * 6 * scale, ch[1] + fy * 6 * scale,
      pel[0] + fx * 4 * scale, pel[1] + fy * 4 * scale,
      waistD * 0.82, waistD * 0.88, waistD * 0.72, 0.45,
      absSt, p, false
    );

    // Sculpted Pectoral projection (with crimson anatomical fibers when active!)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      ch[0] + fx * (chestD * 0.46),
      ch[1] + fy * (chestD * 0.46),
      chestD * 0.62,
      (isF ? 12 : 13.5) * scale,
      Math.atan2(dy, dx),
      0, Math.PI * 2
    );
    if (chestSt === 'primary' || chestSt === 'secondary') {
      ctx.fillStyle = chestSt === 'primary' ? (p > 0.45 ? PAL.priHi : PAL.priMid) : PAL.secMid;
    } else {
      ctx.fillStyle = PAL.skinHi;
    }
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.25; ctx.stroke();
    ctx.restore();

    // Athletic shorts hip/glute wrap (shows crimson tint if glutes are primary target)
    ctx.beginPath();
    ctx.ellipse(
      pel[0] - fx * (isF ? 8 : 6.5) * scale,
      pel[1] - fy * 1.5 * scale,
      (isF ? 14.5 : 13) * scale,
      (isF ? 16 : 14.5) * scale,
      Math.atan2(dy, dx),
      0, Math.PI * 2
    );
    ctx.fillStyle = gluteSt === 'primary' ? PAL.priMid : PAL.shortsMid;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.3; ctx.stroke();
  }

  function drawSneaker(ctx, ax, ay, scale) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ax - 7 * scale, ay - 4 * scale, 22 * scale, 9 * scale, 4);
    ctx.fillStyle = PAL.shoeMid;
    ctx.fill();
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; ctx.stroke();
    // Crisp white sole accent
    ctx.fillStyle = PAL.shoeSole;
    ctx.fillRect(ax - 6 * scale, ay + 3 * scale, 20 * scale, 2.2 * scale);
    ctx.restore();
  }

  // Realistic 3D-shaded gym equipment (behind athlete)
  function drawBackgroundEquipment(ctx, pts, exercise, frame, W, H, mapPt) {
    var floorY = H * 0.92;
    ctx.save();

    // Subtle studio floor horizon line
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, floorY);
    ctx.lineTo(W * 0.94, floorY);
    ctx.stroke();

    // Padded Flat Bench (Leather cushion + steel uprights + feet)
    if (frame.bench) {
      var b1 = mapPt([-0.40, 0.65]), b2 = mapPt([0.20, 0.65]);
      // Steel frame legs
      ctx.fillStyle = '#333A48';
      ctx.fillRect(b1[0] + 16, b1[1] + 10, 9, floorY - (b1[1] + 10));
      ctx.fillRect(b2[0] - 25, b2[1] + 10, 9, floorY - (b2[1] + 10));
      // Floor stabilizers
      ctx.fillStyle = '#1E232D';
      ctx.fillRect(b1[0] + 8, floorY - 5, 26, 5);
      ctx.fillRect(b2[0] - 33, floorY - 5, 26, 5);
      // Leather pad
      ctx.beginPath();
      ctx.roundRect(b1[0], b1[1], b2[0] - b1[0], 12, 4);
      var bg = ctx.createLinearGradient(0, b1[1], 0, b1[1] + 12);
      bg.addColorStop(0, '#3C4454');
      bg.addColorStop(1, '#1A1E27');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.4; ctx.stroke();
    }

    // Incline Bench
    if (frame.inclineBench) {
      var ib1 = mapPt([-0.29, 0.41]), ib2 = mapPt([0.09, 0.68]);
      ctx.strokeStyle = '#333A48';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(ib1[0] + 12, ib1[1] + 10); ctx.lineTo(ib1[0] + 12, floorY);
      ctx.moveTo(ib2[0], ib2[1]); ctx.lineTo(ib2[0], floorY);
      ctx.stroke();
      ctx.strokeStyle = '#2B313F';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ib1[0], ib1[1]); ctx.lineTo(ib2[0], ib2[1]);
      ctx.stroke();
    }

    // Arm Wrestling Competition Table
    if (frame.awTable) {
      var tp1 = mapPt([-0.15, 0.51]), tp2 = mapPt([0.29, 0.51]);
      ctx.fillStyle = '#282E3A';
      ctx.fillRect(tp1[0] + 10, tp1[1] + 10, 8, floorY - (tp1[1] + 10));
      ctx.fillRect(tp2[0] - 18, tp1[1] + 10, 8, floorY - (tp1[1] + 10));
      ctx.beginPath();
      ctx.roundRect(tp1[0], tp1[1], tp2[0] - tp1[0], 11, 3);
      ctx.fillStyle = '#1E222B'; ctx.fill();
      ctx.strokeStyle = '#FF3B30'; ctx.lineWidth = 1.5; ctx.stroke();
      // Elbow pad
      ctx.fillStyle = '#521820';
      ctx.fillRect(tp1[0] + 18, tp1[1] - 7, 38, 7);
    }

    // Cable Machine Tower (when using cable/aw_cable)
    var prop = exercise ? exercise.equipProp : 'none';
    if (prop === 'cable' || prop === 'aw_cable') {
      var tx = W * 0.87;
      ctx.fillStyle = '#232834';
      ctx.fillRect(tx, H * 0.14, 14, floorY - H * 0.14);
      // Weight stack plates
      for (var st = 0; st < 7; st++) {
        ctx.fillStyle = st % 2 === 0 ? '#161A22' : '#2C3240';
        ctx.fillRect(tx - 16, floorY - 12 - st * 10, 32, 7);
      }
      // Pulley wheel
      ctx.beginPath();
      ctx.arc(tx + 2, H * 0.36, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#64748B'; ctx.fill();
    } else if (prop === 'pullup_bar') {
      var barY = exercise.kinematics === 'inverted_row' ? H * 0.41 : H * 0.13;
      ctx.strokeStyle = PAL.steelMid;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W * 0.16, barY); ctx.lineTo(W * 0.84, barY); ctx.stroke();
    } else if (prop === 'dip_bars') {
      var dP = mapPt([0.02, 0.55]);
      ctx.strokeStyle = PAL.steelMid;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(dP[0] - 32, dP[1]); ctx.lineTo(dP[0] + 32, dP[1]);
      ctx.moveTo(dP[0], dP[1]); ctx.lineTo(dP[0], floorY);
      ctx.stroke();
    } else if (prop === 'box') {
      var bx = exercise.kinematics === 'pushup_decline' ? mapPt([-0.50, 0.66]) : mapPt([0.12, 0.72]);
      ctx.fillStyle = '#222733';
      ctx.strokeStyle = '#3B4252';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx[0], bx[1], 56, floorY - bx[1], 4);
      ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }

  // Foreground handheld weights (drawn cleanly on top of wrists with 3/4 realistic plates)
  function drawForegroundWeights(ctx, pts, exercise, frame, W, H) {
    if (!exercise) return;
    var prop = exercise.equipProp;
    ctx.save();

    if (prop === 'barbell') {
      if (frame.view === 'front' && pts.lWr && pts.rWr) {
        var lx = pts.lWr[0] - 38, rx = pts.rWr[0] + 38, by = (pts.lWr[1] + pts.rWr[1]) / 2;
        // Steel bar
        ctx.strokeStyle = PAL.steelHi;
        ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(lx - 10, by); ctx.lineTo(rx + 10, by); ctx.stroke();
        // Stacked Olympic Iron Plates on both ends
        [lx, rx].forEach(function (px, idx) {
          var dir = idx === 0 ? -1 : 1;
          ctx.fillStyle = PAL.plateMid; ctx.strokeStyle = PAL.plateHi; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.roundRect(px + (dir < 0 ? -9 : 1), by - 22, 8, 44, 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.roundRect(px + (dir < 0 ? -16 : 9), by - 16, 6, 32, 2); ctx.fill(); ctx.stroke();
        });
      } else if (pts.wr) {
        // 3/4 foreshortened elliptical Olympic plate + angled bar shaft (never hides chest!)
        var wx = pts.wr[0], wy = pts.wr[1];
        // Bar shaft angled slightly into 3/4 depth
        ctx.strokeStyle = PAL.steelHi;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(wx - 22, wy - 7);
        ctx.lineTo(wx + 24, wy + 7);
        ctx.stroke();

        // Far plate (smaller behind)
        ctx.beginPath();
        ctx.ellipse(wx - 22, wy - 7, 7, 17, -0.18, 0, Math.PI * 2);
        ctx.fillStyle = PAL.plateLo; ctx.fill();
        ctx.strokeStyle = PAL.plateHi; ctx.lineWidth = 1.3; ctx.stroke();

        // Near plate (realistic matte iron disc with metallic hub)
        ctx.beginPath();
        ctx.ellipse(wx + 24, wy + 7, 9, 21, -0.18, 0, Math.PI * 2);
        var pg = ctx.createLinearGradient(wx + 16, wy - 12, wx + 32, wy + 24);
        pg.addColorStop(0, PAL.plateHi);
        pg.addColorStop(0.5, PAL.plateMid);
        pg.addColorStop(1, PAL.plateLo);
        ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = '#525B70'; ctx.lineWidth = 1.5; ctx.stroke();
        // Metallic center hub
        ctx.beginPath();
        ctx.ellipse(wx + 24, wy + 7, 3, 6, -0.18, 0, Math.PI * 2);
        ctx.fillStyle = PAL.steelMid; ctx.fill();
      }
    } else if (prop === 'dumbbells') {
      var wrists = frame.view === 'front' ? [pts.lWr, pts.rWr] : [pts.wr];
      wrists.forEach(function (w) {
        if (!w) return;
        ctx.fillStyle = PAL.steelHi;
        ctx.fillRect(w[0] - 9, w[1] - 2, 18, 4);
        ctx.fillStyle = PAL.plateMid; ctx.strokeStyle = PAL.plateHi; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.roundRect(w[0] - 14, w[1] - 8, 6, 16, 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(w[0] + 8, w[1] - 8, 6, 16, 2); ctx.fill(); ctx.stroke();
      });
    } else if (prop === 'cable' || prop === 'aw_cable') {
      var anchor = [W * 0.87, H * 0.36];
      var target = frame.view === 'front' ? (pts.rWr || pts.lWr) : pts.wr;
      if (target) {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(target[0], target[1]); ctx.stroke();
        ctx.fillStyle = '#1E222B'; ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(target[0], target[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    } else if (prop === 'aw_belt') {
      var hand = frame.view === 'front' ? pts.rWr : pts.wr;
      if (hand) {
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(hand[0], hand[1] + 56); ctx.stroke();
        ctx.fillStyle = PAL.plateMid; ctx.strokeStyle = PAL.plateHi; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(hand[0] - 16, hand[1] + 56, 32, 16, 3); ctx.fill(); ctx.stroke();
      }
    } else if (prop === 'kettlebell' && pts.wr) {
      ctx.beginPath();
      ctx.arc(pts.wr[0] + 5, pts.wr[1] + 11, 12, 0, Math.PI * 2);
      ctx.fillStyle = PAL.plateMid; ctx.fill();
      ctx.strokeStyle = PAL.plateHi; ctx.lineWidth = 1.8; ctx.stroke();
    } else if (prop === 'medball' && pts.wr) {
      ctx.beginPath();
      ctx.arc(pts.wr[0] + 4, pts.wr[1] - 4, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#2B181C'; ctx.fill();
      ctx.strokeStyle = '#FF3B30'; ctx.lineWidth = 1.8; ctx.stroke();
    }
    ctx.restore();
  }

  function renderRig(canvas, exercise, sex, u, opts) {
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect();
    var cssW = rect.width || 340;
    var cssH = rect.height || 255;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    var scale = Math.min(cssW / 340, cssH / 255);
    var kin = root.IronPulseKinematics;
    var frame = kin.samplePose(exercise ? exercise.kinematics : 'squat', u);
    var p = frame.p;
    var isF = sex === 'female';
    var limbScale = (isF ? 0.87 : 1.0) * scale;

    function mapPt(norm) {
      return [cssW * 0.5 + norm[0] * cssH * 0.96, norm[1] * cssH];
    }

    var pts = {};
    Object.keys(frame.pose).forEach(function (k) {
      pts[k] = mapPt(frame.pose[k]);
    });

    // Soft studio floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.beginPath();
    ctx.ellipse(cssW * 0.5, cssH * 0.92, 58 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Background gym equipment
    drawBackgroundEquipment(ctx, pts, exercise, frame, cssW, cssH, mapPt);

    var quadSt = muscleState(['quads', 'hamstrings'], exercise);
    var calfSt = muscleState(['calves'], exercise);
    var deltSt = muscleState(['front_delts', 'side_delts', 'rear_delts'], exercise);
    var armSt = muscleState(['biceps', 'triceps'], exercise);
    var foreSt = muscleState(['brachioradialis', 'wrist_flexors', 'pronators'], exercise);

    if (frame.view === 'front') {
      var thighB = (isF ? 14 : 14.8) * scale;
      drawAthleticLimb(ctx, pts.lHip[0], pts.lHip[1], pts.lKn[0], pts.lKn[1], 11 * scale, thighB, 8.2 * scale, 0.42, quadSt, p, true);
      drawAthleticLimb(ctx, pts.rHip[0], pts.rHip[1], pts.rKn[0], pts.rKn[1], 11 * scale, thighB, 8.2 * scale, 0.42, quadSt, p, true);
      drawAthleticLimb(ctx, pts.lKn[0], pts.lKn[1], pts.lAn[0], pts.lAn[1], 7.8 * scale, 10.2 * scale, 5.4 * scale, 0.34, calfSt, p, false);
      drawAthleticLimb(ctx, pts.rKn[0], pts.rKn[1], pts.rAn[0], pts.rAn[1], 7.8 * scale, 10.2 * scale, 5.4 * scale, 0.34, calfSt, p, false);
      drawSneaker(ctx, pts.lAn[0] - 4 * scale, pts.lAn[1], scale * 0.9);
      drawSneaker(ctx, pts.rAn[0] - 4 * scale, pts.rAn[1], scale * 0.9);

      drawFrontTorso(ctx, pts, sex, scale, exercise, p);

      drawAthleticLimb(ctx, pts.neck[0], pts.neck[1], pts.head[0], pts.head[1] + 5 * scale, 6.2 * limbScale, 6.8 * limbScale, 5.8 * limbScale, 0.5, 'none', 0, false);
      drawHead(ctx, pts.head[0], pts.head[1], pts.neck[0], pts.neck[1], sex, scale, 'front');

      [[pts.lSh, pts.lEl, pts.lWr], [pts.rSh, pts.rEl, pts.rWr]].forEach(function (arm) {
        drawAthleticLimb(ctx, arm[0][0], arm[0][1], arm[1][0], arm[1][1], 8.6 * limbScale, 10.8 * limbScale, 6.8 * limbScale, 0.44, armSt, p, false);
        // Sculpted Deltoid cap
        ctx.beginPath();
        ctx.arc(arm[0][0], arm[0][1], 10 * limbScale, 0, Math.PI * 2);
        ctx.fillStyle = deltSt === 'primary' ? (p > 0.45 ? PAL.priHi : PAL.priMid)
          : deltSt === 'secondary' ? PAL.secMid : PAL.skinHi;
        ctx.fill();
        ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.25; ctx.stroke();

        drawAthleticLimb(ctx, arm[1][0], arm[1][1], arm[2][0], arm[2][1], 7.2 * limbScale, 8.6 * limbScale, 4.6 * limbScale, 0.28, foreSt, p, false);
        ctx.beginPath();
        ctx.arc(arm[2][0], arm[2][1], 5.2 * scale, 0, Math.PI * 2);
        ctx.fillStyle = PAL.skinMid; ctx.fill();
        ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.15; ctx.stroke();
      });
    } else {
      // Rear leg (if split squat)
      if (pts.kn2 && pts.an2) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        drawAthleticLimb(ctx, pts.hip[0], pts.hip[1], pts.kn2[0], pts.kn2[1], 11.5 * scale, 13.5 * scale, 7.8 * scale, 0.45, 'none', 0, true);
        drawAthleticLimb(ctx, pts.kn2[0], pts.kn2[1], pts.an2[0], pts.an2[1], 7.2 * scale, 9.2 * scale, 5.2 * scale, 0.35, 'none', 0, false);
        ctx.restore();
      }

      var sideThighB = (isF ? 15 : 15.8) * scale;
      drawAthleticLimb(ctx, pts.hip[0], pts.hip[1], pts.kn[0], pts.kn[1], 12.5 * scale, sideThighB, 8.5 * scale, 0.42, quadSt, p, true);
      drawAthleticLimb(ctx, pts.kn[0], pts.kn[1], pts.an[0], pts.an[1], 8.2 * scale, 10.6 * scale, 5.5 * scale, 0.34, calfSt, p, false);
      drawSneaker(ctx, pts.an[0], pts.an[1], scale);

      drawSideTorso(ctx, pts, sex, scale, exercise, p);

      drawAthleticLimb(ctx, pts.neck[0], pts.neck[1], pts.head[0], pts.head[1] + 5 * scale, 6.2 * limbScale, 6.8 * limbScale, 5.8 * limbScale, 0.5, 'none', 0, false);
      drawHead(ctx, pts.head[0], pts.head[1], pts.neck[0], pts.neck[1], sex, scale, 'side');

      drawAthleticLimb(ctx, pts.sh[0], pts.sh[1], pts.el[0], pts.el[1], 9 * limbScale, 11.2 * limbScale, 7 * limbScale, 0.44, armSt, p, false);
      ctx.beginPath();
      ctx.arc(pts.sh[0], pts.sh[1], 10.5 * limbScale, 0, Math.PI * 2);
      ctx.fillStyle = deltSt === 'primary' ? (p > 0.45 ? PAL.priHi : PAL.priMid)
        : deltSt === 'secondary' ? PAL.secMid : PAL.skinHi;
      ctx.fill();
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.25; ctx.stroke();

      drawAthleticLimb(ctx, pts.el[0], pts.el[1], pts.wr[0], pts.wr[1], 7.4 * limbScale, 8.8 * limbScale, 4.8 * limbScale, 0.28, foreSt, p, false);
      ctx.beginPath();
      ctx.arc(pts.wr[0], pts.wr[1], 5.4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = PAL.skinMid; ctx.fill();
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.15; ctx.stroke();
    }

    // Draw weights/barbell in foreground so hands grip naturally
    drawForegroundWeights(ctx, pts, exercise, frame, cssW, cssH);

    // Subtle live muscle activation pill strip at bottom
    if (exercise && (!opts || opts.showHud !== false)) {
      var musclesDict = (root.IronPulseData && root.IronPulseData.MUSCLES) || {};
      var pId = exercise.primary[0];
      var sId = exercise.secondary[0];
      var pName = ((musclesDict[pId] && musclesDict[pId].name) || pId || '');
      var sName = sId ? ((musclesDict[sId] && musclesDict[sId].name) || sId) : '';
      var pFire = Math.round(58 + p * 40);
      var sFire = Math.round(30 + p * 36);

      ctx.fillStyle = 'rgba(12,14,20,0.82)';
      ctx.fillRect(0, cssH - 26, cssW, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, cssH - 26, cssW, 1);

      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FF5C58';
      ctx.fillText('● ' + pName + ' ' + pFire + '%', 12, cssH - 13);
      if (sName) {
        ctx.fillStyle = '#CBD5E1';
        ctx.textAlign = 'right';
        ctx.fillText('● ' + sName + ' ' + sFire + '%', cssW - 12, cssH - 13);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
    return frame;
  }

  function createTutorLoop(canvas, getConfig, onFrame) {
    if (root.IronPulse3D && root.IronPulse3D.create3DScene) {
      var glScene = root.IronPulse3D.create3DScene(canvas, {
        mode: 'exercise',
        getConfig: getConfig,
        onFrame: onFrame
      });
      if (glScene) return glScene;
    }
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
        u = (u + dt * 0.34 * speed) % 1;
      }
      var cfg = getConfig();
      var frame = renderRig(canvas, cfg.exercise, cfg.sex, u, cfg.opts);
      if (onFrame && frame) onFrame(frame, u);
      rafId = root.requestAnimationFrame(tick);
    }

    rafId = root.requestAnimationFrame(tick);
    return {
      stop: function () { if (rafId) root.cancelAnimationFrame(rafId); rafId = null; },
      setPaused: function (v) { paused = !!v; },
      isPaused: function () { return paused; },
      setSpeed: function (s) { speed = s; },
      setProgress: function (val) { u = Math.max(0, Math.min(0.999, val)); }
    };
  }

  root.IronPulseRig = { renderRig: renderRig, createTutorLoop: createTutorLoop };
})(typeof window !== 'undefined' ? window : globalThis);
