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
    // Giải mã UTF-8 theo luồng: cộng thẳng Buffer làm vỡ ký tự tiếng Việt nằm vắt qua hai gói mạng
    // (macOS chia gói khác Linux → prompt dài bị đổi vài ký tự, chỉ đỏ trên CI Mac).
    req.setEncoding('utf8');
    req.on('data', (d) => { b += d; });
    req.on('end', () => { try { daGui.push({ ...JSON.parse(b), luc: Date.now() }); } catch (_) {} res.end('ok'); });
    return;
  }
  if (req.method === 'POST' && req.url === '/__xoa') {
    let b = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { b += d; });
    req.on('end', () => { try { const t = JSON.parse(b).thread; for (const g of daGui) if (g.thread === t) g.xoa = true; } catch (_) {} res.end('ok'); });
    return;
  }
  const m = req.url.match(/^\/__thread\/([^/?]+)/);
  if (m) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(daGui.find((g) => g.thread === m[1] && !g.xoa) || null)); return; }
  if (req.url === '/__ds-thread') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(daGui.filter((g) => !g.xoa).reverse().map((g) => ({ thread: g.thread, tieuDe: String(g.prompt).slice(0, 30).replace(/[<&"]/g, '') }))));
    return;
  }
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
      MUSE_E2E_TAM: tam, MUSE_NO_UPDATE_CHECK: '1', MUSE_CHO_KET_NOI_MS: '4000' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let raChu = '';
  p.stdout.on('data', (d) => { raChu += d; process.stdout.write(d); });
  p.stderr.on('data', (d) => { const s = String(d); if (!/dbus|bus\.cc|viz_main|command_buffer|Fontconfig|gpu/i.test(s)) process.stderr.write(s); });
  const hen = setTimeout(() => { console.log('E2E: QUÁ GIỜ (480s)'); p.kill('SIGKILL'); }, 480000);
  p.on('exit', (code) => {
    clearTimeout(hen);
    sv.close();
    console.log(code === 0 ? 'E2E: PASS' : `E2E: FAIL (mã ${code})`);
    if (code !== 0 && process.env.GITHUB_ACTIONS) {
      // Log của job không tải được từ phiên Claude → đưa các dòng đáng chú ý lên thành annotation.
      const quanTrong = raChu.split('\n').filter((l) => /✘|⏱|kẹt|LỖI|KẾT QUẢ|^--/.test(l)).join('\n').slice(-5000);
      const esc = (x) => x.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      console.log(`::error title=E2E ${process.platform}::${esc(quanTrong || raChu.slice(-5000))}`);
    }
    process.exit(code === 0 ? 0 : 1);
  });
});
