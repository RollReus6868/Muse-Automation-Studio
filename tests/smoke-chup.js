'use strict';
// MUSE_TEST=tests/smoke-chup.js electron .  → đi qua từng trang, chụp ảnh vào shots/, ghi lỗi console, rồi thoát.
const fs = require('fs');
const path = require('path');

module.exports = function smoke({ win, app }) {
  const thuMuc = path.join(__dirname, '..', 'shots');
  fs.mkdirSync(thuMuc, { recursive: true });
  const loi = [];
  win.webContents.on('console-message', (_e, muc, chu) => { if (muc >= 2) loi.push(chu); });
  const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (s) => win.webContents.executeJavaScript(s, true);

  win.webContents.once('did-finish-load', async () => {
    try {
      if (process.env.MUSE_SMOKE_SIZE) {
        const [w, h] = process.env.MUSE_SMOKE_SIZE.split('x').map(Number);
        win.setContentSize(w, h);
      }
      await ngu(1500);
      const chup = async (ten) => {
        await ngu(700);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(thuMuc, `${ten}.png`), img.toPNG());
      };
      for (const t of ['anh', 'video', 'nhanvat', 'thuvien', 'taikhoan', 'huongdan', 'caidat']) {
        await js(`window.__diToi(${JSON.stringify(t)})`);
        await chup(t);
      }
      // Trang ảnh: chọn dòng đã xong để xem cột chi tiết, mở cài đặt nâng cao + menu dòng.
      await js(`window.__diToi('anh')`);
      await js(`(() => { const d = [...document.querySelectorAll('.dong-viec')].find((x) => x.querySelector('.pill.xong')); d && d.click();
        document.querySelector('#nangCao').open = true; })()`);
      await chup('anh-chi-tiet');
      await js(`document.querySelector('.dong-viec [data-menu]').click()`);
      await chup('anh-menu-dong');
      await js(`document.body.click(); document.querySelector('#nutNhatKy').click()`);
      await chup('nhat-ky');
      await js(`document.querySelector('#nutNhatKy').click(); document.querySelector('#nutThemDuAn').click()`);
      await chup('hop-thoai');
      await js(`document.querySelector('#hopHuy').click()`);
      // Kiểm tràn ngang: phần tử nào thò ra ngoài cửa sổ.
      const tran = await js(`(() => { const W = innerWidth; return [...document.querySelectorAll('.app *')]
        .filter((e) => e.offsetParent && e.getBoundingClientRect().right > W + 1).slice(0, 8)
        .map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)); })()`);
      const bao = { loiConsole: loi, tranNgang: tran, kichThuoc: win.getContentSize() };
      fs.writeFileSync(path.join(thuMuc, 'bao-cao.json'), JSON.stringify(bao, null, 2));
      console.log('SMOKE', JSON.stringify(bao));
    } catch (err) {
      console.log('SMOKE LOI', err.stack);
      fs.writeFileSync(path.join(thuMuc, 'bao-cao.json'), JSON.stringify({ loi: err.stack }));
    }
    app.exit(0);
  });
};
