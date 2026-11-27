// Dev QA: render a contact sheet of exercises in headless Chromium (SwiftShader WebGL).
// node tools/render/contact-sheet.js out.png "ex1,ex2" "0,0.5" [sex] [yaw] [w] [h] [style]
const path = require('path');
const { chromium } = require(process.env.PW || '/opt/npm-tools/node_modules/playwright');
(async () => {
  const [out, exs, us, sex, yaw, W, H, style, zoom, pitch] = process.argv.slice(2);
  const exList = exs.split(','), uList = us.split(',').map(Number);
  const w = Number(W || 300), h = Number(H || 300);
  const cells = [];
  const MAPFAT = { upper_chest: 70, mid_chest: 40, front_delts: 10, side_delts: 70, rear_delts: 40, traps: 10, lats: 70, rhomboids: 40, lower_back: 10, biceps: 70, triceps: 40, brachioradialis: 10, wrist_flexors: 70, pronators: 40, abs: 70, obliques: 10, glutes: 70, quads: 40, hamstrings: 10, calves: 70 };
  for (const ex of exList) for (const u of uList) {
    if (ex.startsWith('map')) { const yw = Number(ex.slice(3) || 0); cells.push({ ex: 'idle', u, sex: sex || 'male', yaw: yw, pitch: 4, fat: MAPFAT, label: 'map' + yw }); continue; }
    cells.push({ ex, u, sex: sex || 'male', yaw: yaw && yaw !== '-' ? Number(yaw) : null, zoom: zoom ? Number(zoom) : null, pitch: pitch ? Number(pitch) : null });
  }
  const cols = uList.length;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: cols * (w + 4) + 8, height: Math.ceil(cells.length / cols) * (h + 4) + 8 } });
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('[page]', m.text().slice(0, 400)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file://' + path.resolve(__dirname, 'sheet.html'));
  await page.evaluate(o => window.renderSheet(o), { cells, cols, w, h, style: style || 'sculpt' });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})();
