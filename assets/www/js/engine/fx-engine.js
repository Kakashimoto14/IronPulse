(function (root) {
  'use strict';

  var canvas = null;
  var ctx = null;
  var particles = [];
  var rings = [];
  var running = false;

  function ensureCanvas() {
    if (!canvas) {
      canvas = document.getElementById('fx-canvas');
      if (canvas) ctx = canvas.getContext('2d');
    }
    if (!canvas || !ctx) return false;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = root.innerWidth, h = root.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    return true;
  }

  function startLoop() {
    if (running) return;
    running = true;
    function step() {
      if (!ensureCanvas()) { running = false; return; }
      var dpr = Math.min(2, root.devicePixelRatio || 1);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, root.innerWidth, root.innerHeight);

      for (var i = rings.length - 1; i >= 0; i--) {
        var r = rings[i];
        r.radius += r.speed;
        r.alpha -= 0.032;
        if (r.alpha <= 0) { rings.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = r.width;
        ctx.stroke();
      }

      for (var j = particles.length - 1; j >= 0; j--) {
        var p = particles[j];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(j, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }

      ctx.restore();
      if (particles.length > 0 || rings.length > 0) {
        root.requestAnimationFrame(step);
      } else {
        running = false;
      }
    }
    root.requestAnimationFrame(step);
  }

  function emitSetSparks(x, y) {
    if (!ensureCanvas()) return;
    var cx = x || root.innerWidth * 0.5;
    var cy = y || root.innerHeight * 0.55;
    rings.push({ x: cx, y: cy, radius: 8, speed: 5.5, alpha: 0.85, color: '#22C55E', width: 2.5 });
    var palette = ['#22C55E', '#F4F4F2', '#E11D2E'];
    for (var i = 0; i < 18; i++) {
      var a = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.3;
      var sp = 2.5 + Math.random() * 5.2;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.5,
        gravity: 0.18,
        size: 3 + Math.random() * 3,
        color: palette[i % palette.length],
        life: 1,
        decay: 0.035 + Math.random() * 0.02
      });
    }
    startLoop();
  }

  function emitPRIgnition(detailText) {
    if (!ensureCanvas()) return;
    var cx = root.innerWidth * 0.5;
    var cy = root.innerHeight * 0.38;
    rings.push({ x: cx, y: cy, radius: 14, speed: 9.5, alpha: 0.95, color: '#D97706', width: 4 });
    rings.push({ x: cx, y: cy, radius: 6, speed: 6.8, alpha: 0.9, color: '#E11D2E', width: 3 });
    var palette = ['#D97706', '#E11D2E', '#F4F4F2', '#F59E0B'];
    for (var i = 0; i < 42; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 3.5 + Math.random() * 8.5;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2.5,
        gravity: 0.16,
        size: 3.5 + Math.random() * 4.5,
        color: palette[i % palette.length],
        life: 1,
        decay: 0.022 + Math.random() * 0.015
      });
    }
    startLoop();

    // Subtle mechanical screen recoil + industrial PR Ignition Banner
    var shell = document.getElementById('app-shell');
    if (shell) {
      shell.classList.remove('recoil-shake');
      void shell.offsetWidth;
      shell.classList.add('recoil-shake');
    }
    var banner = document.getElementById('pr-banner');
    var detail = document.getElementById('pr-banner-detail');
    if (banner && detail) {
      detail.textContent = detailText || '';
      banner.classList.remove('active');
      void banner.offsetWidth;
      banner.classList.add('active');
    }
  }

  function emitVictoryBlast() {
    if (!ensureCanvas()) return;
    var cx = root.innerWidth * 0.5;
    var cy = root.innerHeight * 0.45;
    rings.push({ x: cx, y: cy, radius: 12, speed: 11, alpha: 1, color: '#E11D2E', width: 5 });
    rings.push({ x: cx, y: cy, radius: 22, speed: 8, alpha: 0.9, color: '#F4F4F2', width: 3 });
    var palette = ['#E11D2E', '#22C55E', '#D97706', '#F4F4F2'];
    for (var i = 0; i < 64; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 4 + Math.random() * 10;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        gravity: 0.15,
        size: 4 + Math.random() * 4,
        color: palette[i % palette.length],
        life: 1,
        decay: 0.018 + Math.random() * 0.012
      });
    }
    startLoop();
  }

  root.IronPulseFX = {
    emitSetSparks: emitSetSparks,
    emitPRIgnition: emitPRIgnition,
    emitVictoryBlast: emitVictoryBlast
  };
})(typeof window !== 'undefined' ? window : globalThis);
