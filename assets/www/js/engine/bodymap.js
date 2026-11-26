(function (root) {
  'use strict';

  function fatiguePalette(val, isSelected) {
    if (isSelected) return { hi: '#FF6B66', mid: '#FF3B30', lo: '#9E1418', stroke: '#F8FAFC', lw: 1.8 };
    if (val >= 65) return { hi: '#FF5660', mid: '#D91E32', lo: '#820D1A', stroke: '#1C1410', lw: 1.05 };
    if (val >= 30) return { hi: '#FBBF24', mid: '#D97706', lo: '#783B05', stroke: '#1C1410', lw: 1.05 };
    if (val > 0) return { hi: '#34D399', mid: '#10B981', lo: '#065F46', stroke: '#1C1410', lw: 1.05 };
    return { hi: '#E4BEA4', mid: '#C89B7F', lo: '#8E624A', stroke: '#1C1410', lw: 0.95 };
  }

  // Draw a sculpted polygonal/bezier anatomical muscle belly with studio lighting & fiber striations
  function drawMuscleShape(ctx, pts, W, H, pal, striationAngle) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    var p0x = pts[0][0] * W / 100;
    var p0y = pts[0][1] * H / 100;
    ctx.moveTo(p0x, p0y);

    var minX = p0x, maxX = p0x, minY = p0y, maxY = p0y;
    for (var i = 1; i < pts.length; i++) {
      var px = pts[i][0] * W / 100;
      var py = pts[i][1] * H / 100;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      var prev = pts[i - 1];
      var mx = ((prev[0] + pts[i][0]) * 0.5) * W / 100;
      var my = ((prev[1] + pts[i][1]) * 0.5) * H / 100;
      ctx.quadraticCurveTo(prev[0] * W / 100, prev[1] * H / 100, mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.quadraticCurveTo(last[0] * W / 100, last[1] * H / 100, p0x, p0y);
    ctx.closePath();

    var grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    grad.addColorStop(0, pal.hi);
    grad.addColorStop(0.55, pal.mid);
    grad.addColorStop(1, pal.lo);
    ctx.fillStyle = grad;
    ctx.fill();

    // Clip and paint crisp ecorché fiber striations inside muscle belly
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 0.85;
    var cx = (minX + maxX) * 0.5;
    var cy = (minY + maxY) * 0.5;
    var span = Math.max(maxX - minX, maxY - minY);
    var cosA = Math.cos(striationAngle || 0);
    var sinA = Math.sin(striationAngle || 0);
    for (var s = -span * 0.4; s <= span * 0.4; s += 4.2) {
      var ox = -sinA * s;
      var oy = cosA * s;
      ctx.beginPath();
      ctx.moveTo(cx + ox - cosA * span, cy + oy - sinA * span);
      ctx.lineTo(cx + ox + cosA * span, cy + oy + sinA * span);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = pal.lw;
    ctx.strokeStyle = pal.stroke;
    ctx.stroke();
    ctx.restore();
  }

  function mirrorPts(pts) {
    return pts.map(function (p) { return [100 - p[0], p[1]]; });
  }

  function getAnatomicalPolys(side, sex) {
    var isF = sex === 'female';
    var sw = isF ? 0.88 : 1.0;
    var hw = isF ? 1.12 : 1.0;

    function sx(x) { return 50 + (x - 50) * sw; }
    function hx(x) { return 50 + (x - 50) * hw; }

    var shapes = [];
    function addPair(id, leftPts, angle) {
      shapes.push({ id: id, pts: leftPts, angle: angle });
      shapes.push({ id: id, pts: mirrorPts(leftPts), angle: -angle });
    }
    function addCenter(id, pts, angle) {
      shapes.push({ id: id, pts: pts, angle: angle });
    }

    if (side === 'front') {
      // Upper Traps (collar ridge)
      addPair('traps', [[44, 18.5], [sx(34), 22.5], [sx(37), 24.5], [46, 21.5]], 0.35);
      // Front Delts & Side Delts
      addPair('side_delts', [[sx(29), 23], [sx(23), 26.5], [sx(22.5), 33.5], [sx(27.5), 32.5]], 1.4);
      addPair('front_delts', [[sx(34), 22.5], [sx(27.5), 24.5], [sx(26.5), 32], [sx(33), 30.5]], 1.2);
      // Clavicular Upper Chest
      addPair('upper_chest', [[49, 23.5], [sx(34.5), 23.5], [sx(33), 28], [49, 27.5]], -0.15);
      // Sternal Mid Chest
      addPair('mid_chest', [[49, 27.5], [sx(33), 28], [sx(34), 35.5], [44, 36.8], [49, 34.5]], 0.12);
      // Biceps peak
      addPair('biceps', [[sx(26.5), 33], [sx(21.5), 36.5], [sx(21.5), 45.5], [sx(26.5), 44.5]], 1.55);
      // Brachioradialis (outer forearm)
      addPair('brachioradialis', [[sx(21.5), 45.5], [sx(16.5), 51], [sx(17.5), 57.5], [sx(21.5), 55]], 1.35);
      // Wrist Flexors / Cupping (inner forearm)
      addPair('wrist_flexors', [[sx(25.5), 45.5], [sx(21.5), 49], [sx(19.5), 59], [sx(23.5), 58]], 1.45);
      // Obliques / V-cut
      addPair('obliques', [[sx(35), 37.5], [sx(37.5), 47], [hx(36.5), 54], [43, 52.5], [42.5, 39]], 1.15);
      // Rectus Abdominis (3 paired abdominal tiers)
      var abW = isF ? 44.2 : 43.2;
      addPair('abs', [[49.2, 37.2], [abW, 37.8], [abW, 42.5], [49.2, 42.2]], 1.57);
      addPair('abs', [[49.2, 43.0], [abW, 43.2], [abW + 0.4, 48.0], [49.2, 47.8]], 1.57);
      addPair('abs', [[49.2, 48.6], [abW + 0.6, 48.8], [45.5, 55.2], [49.2, 55.6]], 1.57);
      // Quads (Vastus Lateralis + Rectus Femoris + Teardrop)
      addPair('quads', [[hx(34.5), 56.5], [hx(32.5), 67.5], [hx(36.5), 76.2], [hx(43.5), 75.5], [hx(46.8), 63], [48.5, 58]], 1.48);
      // Calves (anterior/medial sweep)
      addPair('calves', [[hx(37.5), 78.5], [hx(35.2), 84.5], [hx(38.0), 92.5], [hx(42.5), 92.0], [hx(43.5), 83.5]], 1.55);
    } else {
      // Trapezius diamond hood
      addCenter('traps', [[46, 17.5], [54, 17.5], [sx(65), 23], [58, 33], [50, 38.5], [42, 33], [sx(35), 23]], 0.0);
      // Rear Delts
      addPair('rear_delts', [[sx(34), 23], [sx(25), 25.5], [sx(24), 32.5], [sx(32), 31.5]], -0.5);
      // Rhomboids / Mid Back
      addPair('rhomboids', [[49, 29], [sx(36.5), 31.5], [sx(38.5), 39], [49, 39]], 0.25);
      // Lats V-taper wings
      addPair('lats', [[sx(33), 32.5], [sx(30.5), 40.5], [sx(36), 49], [43.5, 47.5], [42.5, 38.5]], 0.95);
      // Lower Back (Erector Spinae)
      addPair('lower_back', [[49.2, 41], [43.5, 42.5], [43.0, 52.5], [49.2, 53.5]], 1.57);
      // Triceps Horseshoe
      addPair('triceps', [[sx(27), 33], [sx(21.5), 36], [sx(21.5), 46], [sx(27), 44.5]], 1.55);
      // Forearm Pronators / Extensors
      addPair('pronators', [[sx(21.5), 46.5], [sx(16.5), 52], [sx(18), 59.5], [sx(23), 58], [sx(25.5), 47.5]], 1.38);
      // Glutes
      addPair('glutes', [[49.2, 53.8], [hx(35.5), 53.5], [hx(33.5), 60.5], [hx(38.5), 65.2], [49.2, 63.2]], -0.35);
      // Hamstrings
      addPair('hamstrings', [[hx(35.5), 65.2], [hx(34.5), 73.5], [hx(37.5), 77.5], [hx(44.5), 77.0], [hx(46.5), 65.5]], 1.57);
      // Twin-Headed Gastrocnemius Calves
      addPair('calves', [[hx(37.5), 78.5], [hx(34.5), 84.5], [hx(37.5), 92.5], [hx(43.2), 92.0], [hx(44.8), 84.0]], 1.57);
    }
    return shapes;
  }

  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1];
      var xj = pts[j][0], yj = pts[j][1];
      var intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 0.0001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function drawBodyMap(canvas, side, sex, fatigueMap, selectedMuscle, onSelectMuscle) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = 190, H = 290;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    var isF = sex === 'female';
    var sw = isF ? 0.88 : 1.0;
    var hw = isF ? 1.12 : 1.0;

    // 1. Sculpted Head, Neck, Hands, Knees & Feet Base Chassis
    ctx.fillStyle = '#2B303A';
    ctx.strokeStyle = '#14171C';
    ctx.lineWidth = 1.2;

    // Head with jaw taper + female athletic ponytail
    if (isF) {
      ctx.beginPath();
      ctx.arc(W * 0.5 + 11, H * 0.095, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = '#383F4B';
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.095, isF ? 10.5 : 11.8, 14.5, 0, 0, Math.PI * 2);
    var hg = ctx.createLinearGradient(W * 0.42, H * 0.05, W * 0.58, H * 0.14);
    hg.addColorStop(0, '#E8C5AD');
    hg.addColorStop(0.6, '#CE9F83');
    hg.addColorStop(1, '#8E6149');
    ctx.fillStyle = hg;
    ctx.fill(); ctx.stroke();

    // Neck column
    ctx.fillStyle = '#B88A6F';
    ctx.fillRect(W * 0.455, H * 0.145, W * 0.09, H * 0.055);

    // Base structural torso/pelvis/knee/ankle connector so no gaps show between muscle groups
    ctx.fillStyle = '#20242C';
    ctx.beginPath();
    ctx.moveTo(W * (0.5 - 0.19 * sw), H * 0.23);
    ctx.lineTo(W * (0.5 + 0.19 * sw), H * 0.23);
    ctx.lineTo(W * (0.5 + 0.15 * hw), H * 0.58);
    ctx.lineTo(W * (0.5 - 0.15 * hw), H * 0.58);
    ctx.closePath();
    ctx.fill();

    // Hands & Feet anchors
    [[-1, 1], [1, 1]].forEach(function (pair) {
      var s = pair[0];
      // Hand
      ctx.beginPath();
      ctx.ellipse(W * (0.5 + s * 0.305 * sw), H * 0.615, 4.5, 7, s * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#C89B7F';
      ctx.fill(); ctx.stroke();
      // Knee tendon cap
      ctx.beginPath();
      ctx.ellipse(W * (0.5 + s * 0.095 * hw), H * 0.775, 6.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4B525E';
      ctx.fill(); ctx.stroke();
      // Foot
      ctx.beginPath();
      ctx.ellipse(W * (0.5 + s * 0.105 * hw), H * 0.945, 7, 4.2, s * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#B88A6F';
      ctx.fill(); ctx.stroke();
    });

    // 2. Render every sculpted muscle group
    var shapes = getAnatomicalPolys(side, sex);
    for (var i = 0; i < shapes.length; i++) {
      var sh = shapes[i];
      var val = (fatigueMap && fatigueMap[sh.id]) || 0;
      var pal = fatiguePalette(val, selectedMuscle === sh.id);
      drawMuscleShape(ctx, sh.pts, W, H, pal, sh.angle);
    }

    ctx.restore();

    if (onSelectMuscle) {
      canvas.onclick = function (evt) {
        var rect = canvas.getBoundingClientRect();
        var px = ((evt.clientX - rect.left) / rect.width) * 100;
        var py = ((evt.clientY - rect.top) / rect.height) * 100;
        // Exact polygon hit test first
        for (var i = shapes.length - 1; i >= 0; i--) {
          if (pointInPoly(px, py, shapes[i].pts)) {
            onSelectMuscle(shapes[i].id);
            return;
          }
        }
        // Forgiving nearest-centroid touch fallback for fat-thumb mobile taps
        var bestId = null;
        var bestDist = 110;
        for (var k = 0; k < shapes.length; k++) {
          var pts = shapes[k].pts;
          var cx = 0, cy = 0;
          for (var m = 0; m < pts.length; m++) { cx += pts[m][0]; cy += pts[m][1]; }
          cx /= pts.length; cy /= pts.length;
          var d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
          if (d2 < bestDist) { bestDist = d2; bestId = shapes[k].id; }
        }
        if (bestId) onSelectMuscle(bestId);
      };
    }
  }

  root.IronPulseBodyMap = { drawBodyMap: drawBodyMap };
})(typeof window !== 'undefined' ? window : globalThis);
