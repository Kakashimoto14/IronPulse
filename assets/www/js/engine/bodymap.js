(function (root) {
  'use strict';

  function fatigueColor(val) {
    if (val >= 65) return '#E11D2E'; // Fatigued Crimson
    if (val >= 30) return '#D97706'; // Recovering Amber
    if (val > 0) return '#22C55E';   // Active / Fresh Green
    return '#6E7684';                // Rested Silver-Slate
  }

  function getRegions(side, sex) {
    var isF = sex === 'female';
    var sw = isF ? 0.88 : 1.0;
    var hw = isF ? 1.12 : 1.0;
    if (side === 'front') {
      return [
        { id: 'front_delts', x: 50 - 22 * sw, y: 26, rx: 7 * sw, ry: 7 },
        { id: 'front_delts', x: 50 + 22 * sw, y: 26, rx: 7 * sw, ry: 7 },
        { id: 'side_delts', x: 50 - 26 * sw, y: 31, rx: 5 * sw, ry: 6 },
        { id: 'side_delts', x: 50 + 26 * sw, y: 31, rx: 5 * sw, ry: 6 },
        { id: 'upper_chest', x: 50, y: 28, rx: 16 * sw, ry: 4.5 },
        { id: 'mid_chest', x: 50 - 8 * sw, y: 34, rx: 8.5 * sw, ry: 6 },
        { id: 'mid_chest', x: 50 + 8 * sw, y: 34, rx: 8.5 * sw, ry: 6 },
        { id: 'biceps', x: 50 - 27 * sw, y: 40, rx: 5 * sw, ry: 8 },
        { id: 'biceps', x: 50 + 27 * sw, y: 40, rx: 5 * sw, ry: 8 },
        { id: 'brachioradialis', x: 50 - 30 * sw, y: 50, rx: 4.5 * sw, ry: 7.5 },
        { id: 'brachioradialis', x: 50 + 30 * sw, y: 50, rx: 4.5 * sw, ry: 7.5 },
        { id: 'wrist_flexors', x: 50 - 32 * sw, y: 57, rx: 3.8 * sw, ry: 5.5 },
        { id: 'wrist_flexors', x: 50 + 32 * sw, y: 57, rx: 3.8 * sw, ry: 5.5 },
        { id: 'abs', x: 50, y: 46, rx: 7.5 * (isF ? 0.85 : 1), ry: 10 },
        { id: 'obliques', x: 50 - 11.5 * sw, y: 47, rx: 4.5, ry: 9 },
        { id: 'obliques', x: 50 + 11.5 * sw, y: 47, rx: 4.5, ry: 9 },
        { id: 'quads', x: 50 - 10 * hw, y: 68, rx: 8.5 * hw, ry: 13 },
        { id: 'quads', x: 50 + 10 * hw, y: 68, rx: 8.5 * hw, ry: 13 },
        { id: 'calves', x: 50 - 10 * hw, y: 86, rx: 5.5, ry: 8.5 },
        { id: 'calves', x: 50 + 10 * hw, y: 86, rx: 5.5, ry: 8.5 }
      ];
    }
    return [
      { id: 'traps', x: 50, y: 24, rx: 15 * sw, ry: 6 },
      { id: 'rear_delts', x: 50 - 23 * sw, y: 28, rx: 6.5 * sw, ry: 6 },
      { id: 'rear_delts', x: 50 + 23 * sw, y: 28, rx: 6.5 * sw, ry: 6 },
      { id: 'rhomboids', x: 50, y: 34, rx: 11 * sw, ry: 6.5 },
      { id: 'lats', x: 50 - 14 * sw, y: 40, rx: 7.5 * sw, ry: 10 },
      { id: 'lats', x: 50 + 14 * sw, y: 40, rx: 7.5 * sw, ry: 10 },
      { id: 'lower_back', x: 50, y: 48, rx: 8.5, ry: 6 },
      { id: 'triceps', x: 50 - 27 * sw, y: 40, rx: 5.2 * sw, ry: 8 },
      { id: 'triceps', x: 50 + 27 * sw, y: 40, rx: 5.2 * sw, ry: 8 },
      { id: 'pronators', x: 50 - 30 * sw, y: 52, rx: 4.2 * sw, ry: 7.5 },
      { id: 'pronators', x: 50 + 30 * sw, y: 52, rx: 4.2 * sw, ry: 7.5 },
      { id: 'glutes', x: 50 - 9.5 * hw, y: 58, rx: 9.5 * hw, ry: 7.5 },
      { id: 'glutes', x: 50 + 9.5 * hw, y: 58, rx: 9.5 * hw, ry: 7.5 },
      { id: 'hamstrings', x: 50 - 10 * hw, y: 72, rx: 7.5 * hw, ry: 10.5 },
      { id: 'hamstrings', x: 50 + 10 * hw, y: 72, rx: 7.5 * hw, ry: 10.5 },
      { id: 'calves', x: 50 - 10 * hw, y: 86, rx: 5.8, ry: 8.5 },
      { id: 'calves', x: 50 + 10 * hw, y: 86, rx: 5.8, ry: 8.5 }
    ];
  }

  function drawBodyMap(canvas, side, sex, fatigueMap, selectedMuscle, onSelectMuscle) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = 180, H = 260;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Subtle anatomical silhouette backdrop
    var isF = sex === 'female';
    ctx.fillStyle = '#242932';
    ctx.strokeStyle = '#3B424E';
    ctx.lineWidth = 1.5;

    // Head
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.11, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (isF) {
      ctx.beginPath();
      ctx.arc(W * 0.5 + 12, H * 0.12, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#343A46'; ctx.fill();
    }

    // Neck & torso silhouette
    ctx.fillStyle = '#242932';
    ctx.beginPath();
    ctx.roundRect(W * 0.45, H * 0.16, W * 0.10, H * 0.06, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W * (isF ? 0.30 : 0.25), H * 0.23);
    ctx.lineTo(W * (isF ? 0.70 : 0.75), H * 0.23);
    ctx.quadraticCurveTo(W * (isF ? 0.62 : 0.68), H * 0.44, W * (isF ? 0.69 : 0.66), H * 0.57);
    ctx.lineTo(W * (isF ? 0.31 : 0.34), H * 0.57);
    ctx.quadraticCurveTo(W * (isF ? 0.38 : 0.32), H * 0.44, W * (isF ? 0.30 : 0.25), H * 0.23);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Draw interactive muscle regions
    var regions = getRegions(side, sex);
    regions.forEach(function (r) {
      var cx = (r.x / 100) * W;
      var cy = (r.y / 100) * H;
      var rx = (r.rx / 100) * W;
      var ry = (r.ry / 100) * H;
      var val = (fatigueMap && fatigueMap[r.id]) || 0;
      var isSel = selectedMuscle === r.id;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#F4F4F2' : fatigueColor(val);
      ctx.globalAlpha = isSel ? 0.95 : (val > 0 ? 0.92 : 0.62);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeStyle = isSel ? '#E11D2E' : '#121418';
      ctx.stroke();
    });

    ctx.restore();

    if (onSelectMuscle) {
      canvas.onclick = function (evt) {
        var rect = canvas.getBoundingClientRect();
        var px = ((evt.clientX - rect.left) / rect.width) * 100;
        var py = ((evt.clientY - rect.top) / rect.height) * 100;
        for (var i = 0; i < regions.length; i++) {
          var r = regions[i];
          var d = Math.pow((px - r.x) / (r.rx * 1.25), 2) + Math.pow((py - r.y) / (r.ry * 1.25), 2);
          if (d <= 1) {
            onSelectMuscle(r.id);
            return;
          }
        }
      };
    }
  }

  root.IronPulseBodyMap = { drawBodyMap: drawBodyMap };
})(typeof window !== 'undefined' ? window : globalThis);
