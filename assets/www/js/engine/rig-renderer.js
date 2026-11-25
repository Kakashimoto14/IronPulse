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

  var COLORS = {
    primary: '#E11D2E',
    primaryBright: '#FF4353',
    secondary: '#D97706',
    secondaryBright: '#F59E0B',
    stabilizer: '#2563EB',
    stabilizerBright: '#60A5FA',
    baseHi: '#C8CFD8',
    baseMid: '#8C94A0',
    baseShadow: '#464D57',
    outline: '#181B20',
    steel: '#68717E',
    plateIron: '#252930',
    plateRim: '#3C424D'
  };

  // Sculpted anatomical muscle segment between p1 and p2 with tapered asymmetric bellies (NOT sticks!)
  function drawMuscleLimb(ctx, x1, y1, x2, y2, rStart, rBelly, rEnd, bellyPos, fillStyle, hiStyle, striation) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var nx = -uy;
    var ny = ux;

    var bx = x1 + dx * bellyPos;
    var by = y1 + dy * bellyPos;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1 + nx * rStart, y1 + ny * rStart);
    ctx.quadraticCurveTo(bx + nx * rBelly * 1.15, by + ny * rBelly * 1.15, x2 + nx * rEnd, y2 + ny * rEnd);
    ctx.arc(x2, y2, rEnd, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.quadraticCurveTo(bx - nx * rBelly * 0.95, by - ny * rBelly * 0.95, x1 - nx * rStart, y1 - ny * rStart);
    ctx.arc(x1, y1, rStart, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();

    // Directional studio lighting across limb width for sculpted 3D volume
    var grad = ctx.createLinearGradient(bx + nx * rBelly, by + ny * rBelly, bx - nx * rBelly, by - ny * rBelly);
    grad.addColorStop(0, hiStyle);
    grad.addColorStop(0.55, fillStyle);
    grad.addColorStop(1, '#2B3038');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.outline;
    ctx.stroke();

    // Multi-strand Studio Ecorché muscle fiber striations & tendon highlights
    if (striation) {
      [-0.22, 0.12, 0.42].forEach(function (off, idx) {
        ctx.beginPath();
        ctx.moveTo(x1 + dx * 0.15 + nx * rStart * off, y1 + dy * 0.15 + ny * rStart * off);
        ctx.quadraticCurveTo(
          bx + nx * rBelly * (off * 1.15),
          by + ny * rBelly * (off * 1.15),
          x2 - dx * 0.15 + nx * rEnd * off,
          y2 - dy * 0.15 + ny * rEnd * off
        );
        ctx.strokeStyle = idx === 2 ? 'rgba(255,255,255,0.32)' : 'rgba(20,24,30,0.26)';
        ctx.lineWidth = idx === 2 ? 1.25 : 0.95;
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  function resolveMuscleColors(muscleIds, exercise, pulseIntensity) {
    if (!exercise) return { fill: COLORS.baseMid, hi: COLORS.baseHi, active: false };
    var pHit = muscleIds.some(function (m) { return exercise.primary.indexOf(m) !== -1; });
    if (pHit) {
      return {
        fill: COLORS.primary,
        hi: pulseIntensity > 0.45 ? COLORS.primaryBright : '#F03445',
        active: 'primary'
      };
    }
    var sHit = muscleIds.some(function (m) { return exercise.secondary.indexOf(m) !== -1; });
    if (sHit) {
      return {
        fill: COLORS.secondary,
        hi: pulseIntensity > 0.45 ? COLORS.secondaryBright : '#E88B14',
        active: 'secondary'
      };
    }
    var stHit = muscleIds.some(function (m) { return exercise.stabilizers.indexOf(m) !== -1; });
    if (stHit) {
      return {
        fill: COLORS.stabilizer,
        hi: COLORS.stabilizerBright,
        active: 'stabilizer'
      };
    }
    return { fill: COLORS.baseMid, hi: COLORS.baseHi, active: false };
  }

  // Sculpted Human Head (Distinct Male jaw / Female contour + athletic ponytail)
  function drawHead(ctx, hx, hy, nx, ny, sex, scale, view) {
    var r = 17 * scale;
    var angle = Math.atan2(hy - ny, hx - nx) + Math.PI / 2;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle * 0.25);

    // Female athletic ponytail
    if (sex === 'female') {
      ctx.beginPath();
      if (view === 'side') {
        ctx.moveTo(-r * 0.75, -r * 0.25);
        ctx.quadraticCurveTo(-r * 1.65, -r * 0.35, -r * 1.55, r * 0.75);
        ctx.quadraticCurveTo(-r * 1.15, r * 0.35, -r * 0.85, r * 0.05);
      } else {
        ctx.moveTo(r * 0.55, -r * 0.55);
        ctx.quadraticCurveTo(r * 1.15, -r * 0.25, r * 0.95, r * 0.55);
        ctx.quadraticCurveTo(r * 0.65, r * 0.25, r * 0.50, -r * 0.15);
      }
      ctx.closePath();
      ctx.fillStyle = '#3A404A';
      ctx.fill();
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Cranium + sculpted jaw
    ctx.beginPath();
    var jawW = sex === 'female' ? r * 0.62 : r * 0.78;
    ctx.ellipse(0, -r * 0.12, r * 0.84, r * 0.92, 0, Math.PI, 0, false);
    ctx.quadraticCurveTo(r * 0.84, r * 0.58, jawW * 0.55, r * 0.96);
    ctx.quadraticCurveTo(0, r * 1.12, -jawW * 0.55, r * 0.96);
    ctx.quadraticCurveTo(-r * 0.84, r * 0.58, -r * 0.84, -r * 0.12);
    ctx.closePath();

    var hg = ctx.createLinearGradient(-r, -r, r, r);
    hg.addColorStop(0, '#CBD2DB');
    hg.addColorStop(0.6, '#878F9B');
    hg.addColorStop(1, '#3D434D');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.outline;
    ctx.stroke();

    // Subtle brow & ear anatomical landmark lines
    ctx.beginPath();
    if (view === 'side') {
      ctx.moveTo(r * 0.35, -r * 0.12);
      ctx.lineTo(r * 0.82, -r * 0.10);
      ctx.moveTo(r * 0.72, 0.15 * r);
      ctx.lineTo(r * 0.86, 0.26 * r);
    } else {
      ctx.moveTo(-r * 0.45, -r * 0.12);
      ctx.lineTo(-r * 0.12, -r * 0.08);
      ctx.moveTo(r * 0.45, -r * 0.12);
      ctx.lineTo(r * 0.12, -r * 0.08);
    }
    ctx.strokeStyle = 'rgba(20,24,30,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // Sculpted Torso (Front View: Chest/Pecs, Lats, Serratus, Segmented Abs, Pelvis)
  function drawFrontTorso(ctx, pts, sex, scale, exercise, p) {
    var lSh = pts.lSh, rSh = pts.rSh, chest = pts.chest, pel = pts.pelvis, neck = pts.neck;
    var isF = sex === 'female';
    var shW = Math.abs(rSh[0] - lSh[0]) * (isF ? 0.86 : 1.0);
    var waistW = shW * (isF ? 0.56 : 0.72);
    var hipW = shW * (isF ? 0.88 : 0.78);
    var cx = (lSh[0] + rSh[0]) / 2;

    // 1. Trapezius hood
    var trapC = resolveMuscleColors(['traps'], exercise, p);
    ctx.beginPath();
    ctx.moveTo(neck[0] - 9 * scale, neck[1] - 4 * scale);
    ctx.lineTo(neck[0] + 9 * scale, neck[1] - 4 * scale);
    ctx.lineTo(cx + shW * 0.52, rSh[1] + 2 * scale);
    ctx.lineTo(cx - shW * 0.52, lSh[1] + 2 * scale);
    ctx.closePath();
    ctx.fillStyle = trapC.fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // 2. Lats flare wings behind torso
    var latC = resolveMuscleColors(['lats', 'rhomboids'], exercise, p);
    ctx.beginPath();
    ctx.moveTo(cx - shW * 0.48, lSh[1] + 10 * scale);
    ctx.quadraticCurveTo(cx - shW * (isF ? 0.44 : 0.56), chest[1] + 14 * scale, cx - waistW * 0.50, pel[1] - 6 * scale);
    ctx.lineTo(cx + waistW * 0.50, pel[1] - 6 * scale);
    ctx.quadraticCurveTo(cx + shW * (isF ? 0.44 : 0.56), chest[1] + 14 * scale, cx + shW * 0.48, rSh[1] + 10 * scale);
    ctx.closePath();
    ctx.fillStyle = latC.fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // 3. Main Torso Shell + Obliques
    var obC = resolveMuscleColors(['obliques'], exercise, p);
    ctx.beginPath();
    ctx.moveTo(cx - shW * 0.46, lSh[1] + 4 * scale);
    ctx.lineTo(cx + shW * 0.46, rSh[1] + 4 * scale);
    ctx.quadraticCurveTo(cx + waistW * 0.52, (chest[1] + pel[1]) * 0.55, cx + hipW * 0.50, pel[1] + 6 * scale);
    ctx.lineTo(cx, pel[1] + 18 * scale);
    ctx.lineTo(cx - hipW * 0.50, pel[1] + 6 * scale);
    ctx.quadraticCurveTo(cx - waistW * 0.52, (chest[1] + pel[1]) * 0.55, cx - shW * 0.46, lSh[1] + 4 * scale);
    ctx.closePath();
    var tg = ctx.createLinearGradient(cx - shW * 0.5, chest[1], cx + shW * 0.5, chest[1]);
    tg.addColorStop(0, obC.active ? obC.hi : '#B8C0CB');
    tg.addColorStop(0.5, obC.active ? obC.fill : '#8D95A2');
    tg.addColorStop(1, '#3B414B');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Sculpted Pectoral Plates (Upper + Mid Chest)
    var upC = resolveMuscleColors(['upper_chest'], exercise, p);
    var midC = resolveMuscleColors(['mid_chest', 'upper_chest'], exercise, p);
    var pecH = (isF ? 22 : 24) * scale;
    var pecW = shW * 0.44;
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 2 * scale, lSh[1] + 4 * scale);
      ctx.lineTo(cx + side * pecW, lSh[1] + 8 * scale);
      ctx.quadraticCurveTo(cx + side * (pecW * 0.92), lSh[1] + pecH, cx + side * 3 * scale, lSh[1] + pecH * 0.96);
      ctx.closePath();
      var pg = ctx.createLinearGradient(cx, lSh[1], cx, lSh[1] + pecH);
      pg.addColorStop(0, upC.active ? upC.hi : midC.hi);
      pg.addColorStop(1, midC.fill);
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // 5. Rectus Abdominis (Sculpted 6-pack blocks)
    var absC = resolveMuscleColors(['abs'], exercise, p);
    var abTop = lSh[1] + pecH + 4 * scale;
    var abBot = pel[1] + 4 * scale;
    var rowH = (abBot - abTop) / 3.2;
    var abW = waistW * 0.26;
    for (var row = 0; row < 3; row++) {
      var ry = abTop + row * rowH;
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.roundRect(cx + (side < 0 ? -abW - 1.5 : 1.5), ry, abW, rowH * 0.82, 3);
        ctx.fillStyle = absC.active ? (row === 1 && p > 0.45 ? absC.hi : absC.fill) : '#7D8592';
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,24,30,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }

  // Sculpted Side-View Torso (Ribcage, Chest projection, Lats, Lower Back, Abs, Glute cap)
  function drawSideTorso(ctx, pts, sex, scale, exercise, p) {
    var sh = pts.sh, ch = pts.chest, pel = pts.pelvis;
    var isF = sex === 'female';
    var chestC = resolveMuscleColors(['mid_chest', 'upper_chest'], exercise, p);
    var backC = resolveMuscleColors(['lats', 'rhomboids', 'lower_back'], exercise, p);
    var absC = resolveMuscleColors(['abs', 'obliques'], exercise, p);
    var gluteC = resolveMuscleColors(['glutes'], exercise, p);

    // Core spine body
    var dx = pel[0] - sh[0];
    var dy = pel[1] - sh[1];
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    // Front normal pointing forward
    var fx = uy, fy = -ux;
    if (fx < 0 && pts.head[0] >= pel[0]) { fx = -fx; fy = -fy; }

    var chestD = (isF ? 18 : 21) * scale;
    var waistD = (isF ? 12 : 15) * scale;
    var backD = (isF ? 13 : 16) * scale;

    // Back / Lat contour
    drawMuscleLimb(
      ctx,
      sh[0] - fx * 3 * scale, sh[1] - fy * 3 * scale,
      pel[0] - fx * 2 * scale, pel[1] - fy * 2 * scale,
      backD * 0.85, backD * 1.05, waistD * 0.8, 0.35,
      backC.fill, backC.hi, true
    );

    // Front abdominal wall
    drawMuscleLimb(
      ctx,
      ch[0] + fx * 6 * scale, ch[1] + fy * 6 * scale,
      pel[0] + fx * 4 * scale, pel[1] + fy * 4 * scale,
      waistD * 0.85, waistD * 0.9, waistD * 0.72, 0.45,
      absC.fill, absC.hi, true
    );

    // Sculpted Pectoral / Chest projection
    ctx.beginPath();
    ctx.ellipse(
      ch[0] + fx * (chestD * 0.45),
      ch[1] + fy * (chestD * 0.45),
      chestD * 0.65,
      (isF ? 13 : 14) * scale,
      Math.atan2(dy, dx),
      0, Math.PI * 2
    );
    ctx.fillStyle = chestC.active ? (p > 0.45 ? chestC.hi : chestC.fill) : '#9AA2AF';
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Sculpted Glute cap
    ctx.beginPath();
    ctx.ellipse(
      pel[0] - fx * (isF ? 9 : 7) * scale,
      pel[1] - fy * 2 * scale,
      (isF ? 15 : 13) * scale,
      (isF ? 17 : 15) * scale,
      Math.atan2(dy, dx),
      0, Math.PI * 2
    );
    ctx.fillStyle = gluteC.active ? (p > 0.45 ? gluteC.hi : gluteC.fill) : '#838B98';
    ctx.fill();
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Equipment Renderer (Barbell + Plates, Dumbbells, Cable, Pull-up bar, Dip bars, AW Pad & Belt, Kettlebell, Medball, Box)
  function drawEquipment(ctx, pts, exercise, frame, W, H, mapPt) {
    if (!exercise) return;
    var prop = exercise.equipProp;
    ctx.save();

    // Floor reference line
    var floorY = H * 0.92;
    ctx.strokeStyle = '#2B2F36';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, floorY);
    ctx.lineTo(W * 0.94, floorY);
    ctx.stroke();

    // Flat / Incline Bench
    if (frame.bench) {
      var b1 = mapPt([-0.38, 0.65]), b2 = mapPt([0.18, 0.65]);
      ctx.fillStyle = '#252931';
      ctx.strokeStyle = '#4B5260';
      ctx.lineWidth = 2;
      ctx.fillRect(b1[0], b1[1], b2[0] - b1[0], 11);
      ctx.strokeRect(b1[0], b1[1], b2[0] - b1[0], 11);
      ctx.fillStyle = '#3C424D';
      ctx.fillRect(b1[0] + 12, b1[1] + 11, 8, floorY - (b1[1] + 11));
      ctx.fillRect(b2[0] - 20, b2[1] + 11, 8, floorY - (b2[1] + 11));
    }
    if (frame.inclineBench) {
      var ib1 = mapPt([-0.28, 0.42]), ib2 = mapPt([0.08, 0.68]);
      ctx.strokeStyle = '#3C424D';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ib1[0], ib1[1]);
      ctx.lineTo(ib2[0], ib2[1]);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ib1[0] + 14, ib1[1] + 12);
      ctx.lineTo(ib1[0] + 14, floorY);
      ctx.moveTo(ib2[0], ib2[1]);
      ctx.lineTo(ib2[0], floorY);
      ctx.stroke();
    }

    // Arm Wrestling Table & Pad
    if (frame.awTable) {
      var tp1 = mapPt([-0.14, 0.51]), tp2 = mapPt([0.28, 0.51]);
      ctx.fillStyle = '#1E2229';
      ctx.strokeStyle = '#E11D2E';
      ctx.lineWidth = 2;
      ctx.fillRect(tp1[0], tp1[1], tp2[0] - tp1[0], 10);
      ctx.strokeRect(tp1[0], tp1[1], tp2[0] - tp1[0], 10);
      // Elbow pad
      ctx.fillStyle = '#35151B';
      ctx.fillRect(tp1[0] + 18, tp1[1] - 7, 36, 7);
      // Table steel legs
      ctx.fillStyle = '#323741';
      ctx.fillRect(tp1[0] + 8, tp1[1] + 10, 7, floorY - (tp1[1] + 10));
      ctx.fillRect(tp2[0] - 15, tp1[1] + 10, 7, floorY - (tp1[1] + 10));
    }

    // Pull-up bar / Dip bars / Box
    if (prop === 'pullup_bar') {
      var barY = exercise.kinematics === 'inverted_row' ? H * 0.41 : H * 0.13;
      ctx.strokeStyle = '#9AA2AF';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(W * 0.18, barY);
      ctx.lineTo(W * 0.82, barY);
      ctx.stroke();
    } else if (prop === 'dip_bars') {
      var dP = mapPt([0.02, 0.55]);
      ctx.strokeStyle = '#7E8796';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(dP[0] - 32, dP[1]);
      ctx.lineTo(dP[0] + 32, dP[1]);
      ctx.moveTo(dP[0], dP[1]);
      ctx.lineTo(dP[0], floorY);
      ctx.stroke();
    } else if (prop === 'box') {
      var bx = exercise.kinematics === 'pushup_decline' ? mapPt([-0.50, 0.66]) : mapPt([0.12, 0.72]);
      ctx.fillStyle = '#23272F';
      ctx.strokeStyle = '#4B5260';
      ctx.lineWidth = 2;
      ctx.fillRect(bx[0], bx[1], 56, floorY - bx[1]);
      ctx.strokeRect(bx[0], bx[1], 56, floorY - bx[1]);
    }

    // Active handheld props
    if (prop === 'barbell') {
      if (frame.view === 'front' && pts.lWr && pts.rWr) {
        var lx = pts.lWr[0] - 36, rx = pts.rWr[0] + 36, by = (pts.lWr[1] + pts.rWr[1]) / 2;
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(lx, by); ctx.lineTo(rx, by); ctx.stroke();
        // Iron plates
        ctx.fillStyle = '#191C21'; ctx.strokeStyle = '#E11D2E'; ctx.lineWidth = 2;
        ctx.fillRect(lx - 8, by - 22, 12, 44); ctx.strokeRect(lx - 8, by - 22, 12, 44);
        ctx.fillRect(rx - 4, by - 22, 12, 44); ctx.strokeRect(rx - 4, by - 22, 12, 44);
      } else if (pts.wr) {
        // Side-view barbell end plate
        ctx.beginPath();
        ctx.arc(pts.wr[0], pts.wr[1], 22, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.plateIron;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#E11D2E';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pts.wr[0], pts.wr[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = '#D1D5DB';
        ctx.fill();
      }
    } else if (prop === 'dumbbells') {
      var wrists = frame.view === 'front' ? [pts.lWr, pts.rWr] : [pts.wr];
      wrists.forEach(function (w) {
        if (!w) return;
        ctx.fillStyle = '#252930';
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 2;
        ctx.fillRect(w[0] - 12, w[1] - 6, 24, 12);
        ctx.strokeRect(w[0] - 12, w[1] - 6, 24, 12);
      });
    } else if (prop === 'cable' || prop === 'aw_cable') {
      var anchor = frame.view === 'front' ? [W * 0.90, H * 0.36] : [W * 0.90, H * 0.38];
      var target = frame.view === 'front' ? (pts.rWr || pts.lWr) : pts.wr;
      if (target) {
        ctx.strokeStyle = '#9AA2AF';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(anchor[0], anchor[1]);
        ctx.lineTo(target[0], target[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#E11D2E';
        ctx.beginPath(); ctx.arc(target[0], target[1], 5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (prop === 'aw_belt') {
      var hand = frame.view === 'front' ? pts.rWr : pts.wr;
      if (hand) {
        // Judo pronation/rising strap + hanging loading pin weight
        ctx.strokeStyle = '#E11D2E';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hand[0], hand[1]);
        ctx.lineTo(hand[0], hand[1] + 58);
        ctx.stroke();
        ctx.fillStyle = '#252930';
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 2;
        ctx.fillRect(hand[0] - 16, hand[1] + 58, 32, 16);
        ctx.strokeRect(hand[0] - 16, hand[1] + 58, 32, 16);
      }
    } else if (prop === 'kettlebell' && pts.wr) {
      ctx.beginPath();
      ctx.arc(pts.wr[0] + 6, pts.wr[1] + 10, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#252930'; ctx.fill();
      ctx.strokeStyle = '#E11D2E'; ctx.lineWidth = 2.5; ctx.stroke();
    } else if (prop === 'medball' && pts.wr) {
      ctx.beginPath();
      ctx.arc(pts.wr[0] + 4, pts.wr[1] - 4, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#2C1B1E'; ctx.fill();
      ctx.strokeStyle = '#E11D2E'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.restore();
  }

  function drawForceVector(ctx, force, mapPt, p) {
    if (!force) return;
    var a = mapPt([force[0], force[1]]);
    var b = mapPt([force[2], force[3]]);
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save();
    ctx.globalAlpha = 0.45 + p * 0.45;
    ctx.strokeStyle = '#E11D2E';
    ctx.fillStyle = '#E11D2E';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] - 9 * Math.cos(ang - 0.45), b[1] - 9 * Math.sin(ang - 0.45));
    ctx.lineTo(b[0] - 9 * Math.cos(ang + 0.45), b[1] - 9 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
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
    var limbScale = (isF ? 0.88 : 1.0) * scale;

    function mapPt(norm) {
      return [cssW * 0.5 + norm[0] * cssH * 0.96, norm[1] * cssH];
    }

    var pts = {};
    Object.keys(frame.pose).forEach(function (k) {
      pts[k] = mapPt(frame.pose[k]);
    });

    // Subtle floor shadow under athlete
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cssW * 0.5, cssH * 0.92, 56 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Background equipment (benches, tables, bars)
    drawEquipment(ctx, pts, exercise, frame, cssW, cssH, mapPt);

    var quadC = resolveMuscleColors(['quads', 'hamstrings'], exercise, p);
    var calfC = resolveMuscleColors(['calves'], exercise, p);
    var deltC = resolveMuscleColors(['front_delts', 'side_delts', 'rear_delts'], exercise, p);
    var armC = resolveMuscleColors(['biceps', 'triceps'], exercise, p);
    var foreC = resolveMuscleColors(['brachioradialis', 'wrist_flexors', 'pronators'], exercise, p);

    if (frame.view === 'front') {
      // Legs (Sculpted Quad/Hamstring thighs + Calves)
      var thighB = (isF ? 14.5 : 15) * scale;
      drawMuscleLimb(ctx, pts.lHip[0], pts.lHip[1], pts.lKn[0], pts.lKn[1], 11 * scale, thighB, 8.5 * scale, 0.42, quadC.fill, quadC.hi, true);
      drawMuscleLimb(ctx, pts.rHip[0], pts.rHip[1], pts.rKn[0], pts.rKn[1], 11 * scale, thighB, 8.5 * scale, 0.42, quadC.fill, quadC.hi, true);
      drawMuscleLimb(ctx, pts.lKn[0], pts.lKn[1], pts.lAn[0], pts.lAn[1], 8 * scale, 10.5 * scale, 5.5 * scale, 0.34, calfC.fill, calfC.hi, true);
      drawMuscleLimb(ctx, pts.rKn[0], pts.rKn[1], pts.rAn[0], pts.rAn[1], 8 * scale, 10.5 * scale, 5.5 * scale, 0.34, calfC.fill, calfC.hi, true);

      // Torso (Traps, Lats, Pecs, Abs)
      drawFrontTorso(ctx, pts, sex, scale, exercise, p);

      // Neck & Head
      drawMuscleLimb(ctx, pts.neck[0], pts.neck[1], pts.head[0], pts.head[1] + 6 * scale, 6.5 * limbScale, 7 * limbScale, 6 * limbScale, 0.5, COLORS.baseMid, COLORS.baseHi, false);
      drawHead(ctx, pts.head[0], pts.head[1], pts.neck[0], pts.neck[1], sex, scale, 'front');

      // Upper Arms + Deltoid Caps + Forearms (Brachioradialis/Pronators)
      [
        [pts.lSh, pts.lEl, pts.lWr],
        [pts.rSh, pts.rEl, pts.rWr]
      ].forEach(function (arm) {
        drawMuscleLimb(ctx, arm[0][0], arm[0][1], arm[1][0], arm[1][1], 9 * limbScale, 11 * limbScale, 7 * limbScale, 0.45, armC.fill, armC.hi, true);
        // Sculpted Deltoid shoulder cap
        ctx.beginPath();
        ctx.arc(arm[0][0], arm[0][1], 10.5 * limbScale, 0, Math.PI * 2);
        ctx.fillStyle = deltC.active ? (p > 0.45 ? deltC.hi : deltC.fill) : '#959DA9';
        ctx.fill();
        ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.3; ctx.stroke();
        // Forearm
        drawMuscleLimb(ctx, arm[1][0], arm[1][1], arm[2][0], arm[2][1], 7.5 * limbScale, 8.8 * limbScale, 4.8 * limbScale, 0.28, foreC.fill, foreC.hi, true);
        // Fist
        ctx.beginPath();
        ctx.arc(arm[2][0], arm[2][1], 5.5 * scale, 0, Math.PI * 2);
        ctx.fillStyle = foreC.active ? foreC.hi : '#B8C0CB';
        ctx.fill();
        ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.2; ctx.stroke();
      });
    } else {
      // SIDE VIEW: Rear Leg (if split squat)
      if (pts.kn2 && pts.an2) {
        drawMuscleLimb(ctx, pts.hip[0], pts.hip[1], pts.kn2[0], pts.kn2[1], 12 * scale, 14 * scale, 8 * scale, 0.45, '#59606C', '#747C88', false);
        drawMuscleLimb(ctx, pts.kn2[0], pts.kn2[1], pts.an2[0], pts.an2[1], 7.5 * scale, 9.5 * scale, 5.5 * scale, 0.35, '#59606C', '#747C88', false);
      }

      // Near Leg (Quads/Hamstrings + Calf + Foot)
      var sideThighB = (isF ? 16 : 16.5) * scale;
      drawMuscleLimb(ctx, pts.hip[0], pts.hip[1], pts.kn[0], pts.kn[1], 13 * scale, sideThighB, 9 * scale, 0.42, quadC.fill, quadC.hi, true);
      drawMuscleLimb(ctx, pts.kn[0], pts.kn[1], pts.an[0], pts.an[1], 8.5 * scale, 11 * scale, 5.8 * scale, 0.34, calfC.fill, calfC.hi, true);
      // Athletic Shoe / Foot
      ctx.beginPath();
      ctx.roundRect(pts.an[0] - 8 * scale, pts.an[1] - 4 * scale, 24 * scale, 9 * scale, 4);
      ctx.fillStyle = '#363C46';
      ctx.fill();
      ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.2; ctx.stroke();

      // Side Torso
      drawSideTorso(ctx, pts, sex, scale, exercise, p);

      // Neck & Head
      drawMuscleLimb(ctx, pts.neck[0], pts.neck[1], pts.head[0], pts.head[1] + 5 * scale, 6.5 * limbScale, 7.2 * limbScale, 6 * limbScale, 0.5, COLORS.baseMid, COLORS.baseHi, false);
      drawHead(ctx, pts.head[0], pts.head[1], pts.neck[0], pts.neck[1], sex, scale, 'side');

      // Near Arm (Bicep/Tricep + Deltoid Cap + Forearm)
      drawMuscleLimb(ctx, pts.sh[0], pts.sh[1], pts.el[0], pts.el[1], 9.5 * limbScale, 11.5 * limbScale, 7.2 * limbScale, 0.45, armC.fill, armC.hi, true);
      ctx.beginPath();
      ctx.arc(pts.sh[0], pts.sh[1], 11 * limbScale, 0, Math.PI * 2);
      ctx.fillStyle = deltC.active ? (p > 0.45 ? deltC.hi : deltC.fill) : '#959DA9';
      ctx.fill();
      ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.3; ctx.stroke();

      drawMuscleLimb(ctx, pts.el[0], pts.el[1], pts.wr[0], pts.wr[1], 7.8 * limbScale, 9 * limbScale, 5 * limbScale, 0.28, foreC.fill, foreC.hi, true);
      ctx.beginPath();
      ctx.arc(pts.wr[0], pts.wr[1], 5.8 * scale, 0, Math.PI * 2);
      ctx.fillStyle = foreC.active ? foreC.hi : '#B8C0CB';
      ctx.fill();
      ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // Force-vector coaching overlay
    if (!opts || opts.showVectors !== false) {
      drawForceVector(ctx, frame.force, mapPt, p);
    }

    // Live Ecorché Muscle Firing Telemetry Bar at bottom edge of canvas
    if (exercise && (!opts || opts.showHud !== false)) {
      var musclesDict = (root.IronPulseData && root.IronPulseData.MUSCLES) || {};
      var pId = exercise.primary[0];
      var sId = exercise.secondary[0];
      var pName = ((musclesDict[pId] && musclesDict[pId].name) || pId || '').toUpperCase();
      var sName = sId ? (((musclesDict[sId] && musclesDict[sId].name) || sId).toUpperCase()) : '';
      var pFire = Math.round(52 + p * 46);
      var sFire = Math.round(28 + p * 40);

      ctx.fillStyle = 'rgba(11,12,14,0.82)';
      ctx.fillRect(0, cssH - 22, cssW, 22);
      ctx.fillStyle = '#2B2F36';
      ctx.fillRect(0, cssH - 22, cssW, 1);

      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FF4353';
      ctx.fillText('● ' + pName + ' ' + pFire + '%', 10, cssH - 11);
      if (sName) {
        ctx.fillStyle = '#F59E0B';
        ctx.textAlign = 'right';
        ctx.fillText('● ' + sName + ' ' + sFire + '%', cssW - 10, cssH - 11);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
    return frame;
  }

  // Reusable 60 FPS Animation Controller for any Tutor Canvas
  function createTutorLoop(canvas, getConfig, onFrame) {
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
