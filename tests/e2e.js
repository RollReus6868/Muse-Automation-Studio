'use strict';
// node tests/e2e.js — dựng máy chủ Muse giả rồi chạy APP THẬT (electron .) trên nó.
// Kịch bản nằm ở tests/e2e-chay.js (chạy bên trong app qua MUSE_TEST).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const fixture = fs.readFileSync(path.join(__dirname, 'fixture-muse.html'));
const daGui = [];
const sv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__gui') {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => { try { daGui.push({ ...JSON.parse(b), luc: Date.now() }); } catch (_) {} res.end('ok'); });
    return;
  }
  const m = req.url.match(/^\/__thread\/([^/?]+)/);
  if (m) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(daGui.find((g) => g.thread === m[1]) || null)); return; }
  if (req.url === '/__da-gui') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(daGui)); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(fixture);
});

sv.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${sv.address().port}`;
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-e2e-'));
  const electron = require('electron');
  const args = ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const p = spawn(electron, args, {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, MUSE_URL: url, MUSE_TEST: 'tests/e2e-chay.js', MUSE_DATA_DIR: path.join(tam, 'data'),
      MUSE_E2E_TAM: tam, MUSE_NO_UPDATE_CHECK: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.stdout.on('data', (d) => process.stdout.write(d));
  p.stderr.on('data', (d) => { const s = String(d); if (!/dbus|bus\.cc|viz_main|command_buffer|Fontconfig|gpu/i.test(s)) process.stderr.write(s); });
  const hen = setTimeout(() => { console.log('E2E: QUÁ GIỜ (240s)'); p.kill('SIGKILL'); }, 240000);
  p.on('exit', (code) => {
    clearTimeout(hen);
    sv.close();
    console.log(code === 0 ? 'E2E: PASS' : `E2E: FAIL (mã ${code})`);
    process.exit(code === 0 ? 0 : 1);
  });
});
