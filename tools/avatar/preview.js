// Dev-only mesh preview: node tools/avatar/preview.js <mesh.bin> <out.png> [views]
// mesh.bin = uint32 nV, uint32 nF, float32 V[nV*3], uint32 F[nF*3]
const fs = require('fs');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const [bin, out, viewsArg, zoomArg] = process.argv.slice(2);
  const b64 = fs.readFileSync(bin).toString('base64');
  const views = (viewsArg || '0,40,90,180').split(',').map(Number);
  const zoom = zoomArg ? zoomArg.split(',').map(Number) : null; // [cy, dist]
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 380 * views.length, height: 720 } });
  await page.setContent('<body style="margin:0;background:#151922"><canvas id=c width=' + 380 * views.length + ' height=720></canvas></body>');
  await page.evaluate(({ b64, views, zoom }) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dv = new DataView(bin.buffer);
    const nV = dv.getUint32(0, true), nF = dv.getUint32(4, true);
    const V = new Float32Array(bin.buffer, 8, nV * 3);
    const F = new Uint32Array(bin.buffer, 8 + nV * 12, nF * 3);
    const N = new Float32Array(nV * 3);
    for (let i = 0; i < nF; i++) {
      const a = F[i*3]*3, b = F[i*3+1]*3, c = F[i*3+2]*3;
      const ux = V[b]-V[a], uy = V[b+1]-V[a+1], uz = V[b+2]-V[a+2];
      const vx = V[c]-V[a], vy = V[c+1]-V[a+1], vz = V[c+2]-V[a+2];
      const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
      for (const k of [a,b,c]) { N[k]+=nx; N[k+1]+=ny; N[k+2]+=nz; }
    }
    const gl = document.getElementById('c').getContext('webgl');
    gl.getExtension('OES_element_index_uint');
    const vs = 'attribute vec3 p;attribute vec3 n;uniform mat4 M;varying vec3 vn;varying vec3 vp;void main(){vn=n;vp=p;gl_Position=M*vec4(p,1.);}';
    const fsrc = 'precision highp float;varying vec3 vn;varying vec3 vp;uniform vec3 E;void main(){vec3 N=normalize(vn);vec3 V=normalize(E-vp);vec3 L=normalize(vec3(.5,.8,.7));vec3 L2=normalize(vec3(-.7,.3,-.5));float d=max(dot(N,L),0.);float w=max((dot(N,L)+.4)/1.4,0.);vec3 H=normalize(L+V);float s=pow(max(dot(N,H),0.),40.)*.35;float r=pow(1.-max(dot(N,V),0.),3.)*.35;vec3 c=vec3(.8,.82,.86)*(.22+.55*w+.25*max(dot(N,L2),0.)+.1*(.5+.5*N.y))+s+r*vec3(.7,.8,1.);gl_FragColor=vec4(pow(c/(c+.6),vec3(.85))*1.25,1.);}';
    function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fsrc)); gl.linkProgram(pr); gl.useProgram(pr);
    function buf(arr, loc, sz) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, loc); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 0, 0); }
    buf(V, 'p', 3); buf(N, 'n', 3);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, F, gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.08, 0.1, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cy = zoom ? zoom[0] : 0.9, dist = zoom ? zoom[1] : 4.2;
    views.forEach((yaw, i) => {
      gl.viewport(i * 380, 0, 380, 720);
      const yr = yaw * Math.PI / 180, ex = Math.sin(yr) * dist, ez = Math.cos(yr) * dist, ey = cy + 0.15;
      const f = 1 / Math.tan(0.2), asp = 380 / 720, nn = 0.1, ff = 20;
      const P = [f/asp,0,0,0, 0,f,0,0, 0,0,(ff+nn)/(nn-ff),-1, 0,0,2*ff*nn/(nn-ff),0];
      let zx = ex, zy = ey - cy, zz = ez; const zl = Math.hypot(zx, zy, zz); zx/=zl; zy/=zl; zz/=zl;
      let xx = zz, xz = -zx; const xl = Math.hypot(xx, xz); xx/=xl; xz/=xl;
      const yx = zy*xz, yy = zz*xx - zx*xz, yz = -zy*xx;
      const Vw = [xx,yx,zx,0, 0,yy,zy,0, xz,yz,zz,0, -(xx*ex+xz*ez), -(yx*ex+yy*ey+yz*ez), -(zx*ex+zy*ey+zz*ez), 1];
      const Mm = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k*4+r]*Vw[c*4+k]; Mm[c*4+r] = s; }
      gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'M'), false, Mm);
      gl.uniform3f(gl.getUniformLocation(pr, 'E'), ex, ey, ez);
      gl.drawElements(gl.TRIANGLES, nF * 3, gl.UNSIGNED_INT, 0);
    });
  }, { b64, views, zoom });
  await page.screenshot({ path: out });
  await browser.close();
})();
