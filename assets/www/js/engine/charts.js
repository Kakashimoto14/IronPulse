(function (root) {
  'use strict';

  function drawLineChart(canvas, points, opts) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect();
    var W = rect.width || 320;
    var H = rect.height || 155;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    var padL = 40, padR = 14, padT = 16, padB = 26;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var accent = (opts && opts.color) || '#E11D2E';
    var unit = (opts && opts.unit) || '';

    // Industrial grid backdrop
    ctx.fillStyle = '#0F1115';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#242830';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(W - padR, gy);
      ctx.stroke();
    }

    if (!points || points.length === 0) {
      ctx.fillStyle = '#8E95A0';
      ctx.font = '700 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((opts && opts.emptyText) || 'LOG SESSIONS TO PLOT TREND', W * 0.5, H * 0.5);
      ctx.restore();
      return;
    }

    var vals = points.map(function (p) { return Number(p.value) || 0; });
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    if (maxV === minV) {
      minV = Math.max(0, minV - 5);
      maxV = maxV + 5;
    } else {
      var padRange = (maxV - minV) * 0.16;
      minV = Math.max(0, minV - padRange);
      maxV = maxV + padRange;
    }

    function xFor(i) {
      if (points.length === 1) return padL + plotW * 0.5;
      return padL + (i / (points.length - 1)) * plotW;
    }
    function yFor(v) {
      return padT + plotH - ((v - minV) / (maxV - minV)) * plotH;
    }

    // Y-axis tabular labels
    ctx.fillStyle = '#8E95A0';
    ctx.font = '700 9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var yTick = 0; yTick <= 3; yTick++) {
      var tv = maxV - ((maxV - minV) * yTick) / 3;
      ctx.fillText(tv.toFixed(tv >= 100 ? 0 : 1), padL - 6, padT + (plotH * yTick) / 3);
    }

    // Sharp polyline
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var px = xFor(i), py = yFor(points[i].value);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Subtle flat tint fill under line (no garish rainbow gradient)
    if (points.length > 1) {
      ctx.lineTo(xFor(points.length - 1), padT + plotH);
      ctx.lineTo(xFor(0), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = accent === '#22C55E' ? 'rgba(34,197,94,0.10)' : accent === '#D97706' ? 'rgba(217,119,6,0.10)' : 'rgba(225,29,46,0.12)';
      ctx.fill();
    }

    // Data nodes + X-axis date ticks
    var peakVal = Math.max.apply(null, vals);
    for (var k = 0; k < points.length; k++) {
      var nx = xFor(k), ny = yFor(points[k].value);
      var isPeak = points[k].value === peakVal && k === vals.lastIndexOf(peakVal);

      ctx.beginPath();
      ctx.arc(nx, ny, isPeak ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isPeak ? '#F4F4F2' : accent;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = accent;
      ctx.stroke();

      if (isPeak) {
        ctx.fillStyle = '#F4F4F2';
        ctx.font = '800 10px ui-monospace, monospace';
        ctx.textAlign = nx > W - 55 ? 'right' : nx < padL + 40 ? 'left' : 'center';
        ctx.fillText(points[k].value + (unit ? ' ' + unit : ''), nx, Math.max(10, ny - 10));
      }

      if (k === 0 || k === points.length - 1 || (points.length > 4 && k === Math.floor(points.length / 2))) {
        ctx.fillStyle = '#8E95A0';
        ctx.font = '700 9px ui-monospace, monospace';
        ctx.textAlign = k === 0 ? 'left' : k === points.length - 1 ? 'right' : 'center';
        ctx.fillText(points[k].label || '', nx, H - 9);
      }
    }

    ctx.restore();
  }

  root.IronPulseCharts = { drawLineChart: drawLineChart };
})(typeof window !== 'undefined' ? window : globalThis);
