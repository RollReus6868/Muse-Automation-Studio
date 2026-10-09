'use strict';
// ============================================================================
//  Muse Automation Studio — tiến trình chính (Electron)
//  Cửa sổ giao diện + các luồng muse.ai chạy ngầm (mỗi luồng một
//  WebContentsView trong phiên của tài khoản) + đăng nhập + file + cập nhật.
// ============================================================================

const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const pkg = require('./package.json');
const { Store } = require('./src/main/store');
const { QuanLyTaiKhoan } = require('./src/main/tai-khoan');
const { DieuPhoi } = require('./src/main/dieu-phoi');
const { Luong } = require('./src/main/luong');
const { BoCapNhat, layRepo } = require('./src/main/cap-nhat');
const hd = require('./src/main/hang-doi');

// Thư mục dữ liệu riêng (phiên đăng nhập, cài đặt, hàng đợi) — PHẢI trước whenReady.
app.setPath('userData', process.env.MUSE_DATA_DIR ||
  path.join(app.getPath('appData'), 'MuseAutomationStudio'));

const GOC_MUSE = (process.env.MUSE_URL || 'https://muse.ai').replace(/\/$/, '');
const NGUON_TRANG = fs.readFileSync(path.join(__dirname, 'src/inject/muse-trang.js'), 'utf8');
const DUOI_ANH = /\.(png|jpe?g|webp|gif|bmp)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

let win = null;
let store, taiKhoan, dieuPhoi, capNhat;
const nhatKy = [];
let henBao = null;

// ── Nhật ký + đẩy trạng thái cho giao diện ─────────────────────────────────
function log(muc, chu) {
  const dong = { t: Date.now(), muc, chu: String(chu) };
  nhatKy.push(dong);
  if (nhatKy.length > 800) nhatKy.splice(0, nhatKy.length - 800);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'nhat-ky.txt'),
    `${new Date(dong.t).toISOString()} [${muc}] ${dong.chu}\n`); } catch (_) {}
  if (win && !win.isDestroyed()) win.webContents.send('log', dong);
}

function baoTrangThai() {
  if (henBao) return;
  henBao = setTimeout(() => {
    henBao = null;
    if (!win || win.isDestroyed() || !dieuPhoi) return;
    win.webContents.send('state', trangThai());
  }, 150);
}

function trangThai() {
  return {
    ...dieuPhoi.trangThai(),
    taiKhoan: taiKhoan.list(),
    capNhat: capNhat ? capNhat.trangThai() : null,
    phienBan: pkg.version,
    nenTang: process.platform,
    dangNhap: dangNhap ? { id: dangNhap.id, khung: dangNhap.view.getBounds() } : null
  };
}

// ── Phiên theo tài khoản ──────────────────────────────────────────────────
const daCauHinh = new Set();
function phien(tk) {
  const ses = session.fromPartition(tk.partition);
  if (!daCauHinh.has(tk.partition)) {
    daCauHinh.add(tk.partition);
    // Bỏ chữ "Electron/…" khỏi user agent: nhiều trang chặn đăng nhập trong webview.
    ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|MuseAutomationStudio|muse-automation-studio)\/\S+/gi, ''));
  }
  return ses;
}

function taoView(tk) {
  const v = new WebContentsView({
    webPreferences: { session: phien(tk), backgroundThrottling: false, contextIsolation: true, sandbox: true }
  });
  v.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) v.webContents.loadURL(url);
    return { action: 'deny' };
  });
  v.webContents.setAudioMuted(true);
  return v;
}

// ── Luồng chạy ngầm ───────────────────────────────────────────────────────
const viewCuaLuong = new Map();
let xemLuong = !!process.env.MUSE_SHOW_LANES;

function taoLuong(tk, stt) {
  const v = taoView(tk);
  win.contentView.addChildView(v);
  // GIỮ kích thước thật (không thu về 0×0): trang ẩn kích thước 0 có thể không vẽ ảnh.
  v.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  v.setVisible(xemLuong);
  const l = new Luong({ id: `${tk.ten} · L${stt}`, taiKhoan: tk, wc: v.webContents, nguon: NGUON_TRANG, goc: GOC_MUSE, log });
  viewCuaLuong.set(l, v);
  return l;
}

function huyLuong(l) {
  const v = viewCuaLuong.get(l);
  viewCuaLuong.delete(l);
  if (!v) return;
  try { win.contentView.removeChildView(v); } catch (_) {}
  try { v.webContents.close(); } catch (_) {}
}

// ── Đăng nhập: một trình duyệt hiện trong khung của trang Tài khoản ─────────
let dangNhap = null;   // { id, view }

function moDangNhap(id, khung) {
  dongDangNhap(false);
  const tk = taiKhoan.tim(id);
  if (!tk) return { ok: false, loi: 'Không tìm thấy tài khoản' };
  const v = taoView(tk);
  win.contentView.addChildView(v);
  dangNhap = { id, view: v };
  datKhungDangNhap(khung);
  v.webContents.loadURL(GOC_MUSE).catch(() => {});
  baoTrangThai();
  return { ok: true };
}

function datKhungDangNhap(k) {
  if (!dangNhap || !k) return;
  dangNhap.view.setBounds({ x: Math.round(k.x), y: Math.round(k.y),
    width: Math.max(200, Math.round(k.width)), height: Math.max(200, Math.round(k.height)) });
}

async function dongDangNhap(kiem = true) {
  if (!dangNhap) return;
  const { id, view } = dangNhap;
  dangNhap = null;
  if (kiem) {
    const tt = await docTrangThai(view.webContents, 4000);
    if (tt) taiKhoan.sua(id, { trangThai: tt.coONhap ? 'da-dang-nhap' : 'can-dang-nhap' });
  }
  try { win.contentView.removeChildView(view); } catch (_) {}
  try { view.webContents.close(); } catch (_) {}
  baoTrangThai();
}

async function docTrangThai(wc, ms) {
  const het = Date.now() + ms;
  let tt = null;
  while (Date.now() < het) {
    try {
      await wc.executeJavaScript(NGUON_TRANG, true);
      tt = await wc.executeJavaScript('window.__muse.trangThai()', true);
      if (tt.coONhap || tt.canDangNhap) return tt;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return tt;
}

/** Kiểm đăng nhập mà không mở gì lên màn hình. */
async function kiemTaiKhoan(id) {
  const tk = taiKhoan.tim(id);
  if (!tk) return null;
  const v = taoView(tk);
  win.contentView.addChildView(v);
  v.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  v.setVisible(false);
  v.webContents.loadURL(GOC_MUSE).catch(() => {});
  const tt = await docTrangThai(v.webContents, 25000);
  const kq = tt && tt.coONhap ? 'da-dang-nhap' : tt && tt.canDangNhap ? 'can-dang-nhap' : 'chua-kiem';
  taiKhoan.sua(id, { trangThai: kq });
  try { win.contentView.removeChildView(v); } catch (_) {}
  try { v.webContents.close(); } catch (_) {}
  log(kq === 'da-dang-nhap' ? 'success' : 'warning',
    `👤 "${tk.ten}": ${kq === 'da-dang-nhap' ? 'đã đăng nhập Muse' : kq === 'can-dang-nhap' ? 'CHƯA đăng nhập' : 'không kiểm được (mạng?)'}`);
  baoTrangThai();
  return kq;
}

// ── File ──────────────────────────────────────────────────────────────────
function docFile(p) {
  const duoi = path.extname(p).slice(1).toLowerCase();
  return { ten: path.basename(p), mime: MIME[duoi] || 'image/png', b64: fs.readFileSync(p).toString('base64') };
}
function ghiFile(dich, buf) {
  fs.mkdirSync(path.dirname(dich), { recursive: true });
  fs.writeFileSync(dich, buf);
}
function anhTrongThuMuc(dir) {
  return fs.readdirSync(dir).filter((f) => DUOI_ANH.test(f)).sort(hd.soSanhTuNhien).map((f) => path.join(dir, f));
}
/** Chép ảnh nhân vật vào thư mục dữ liệu, để xoá/di chuyển ảnh gốc không làm hỏng nhân vật. */
function chepAnhNhanVat(nvId, ds) {
  const dir = path.join(app.getPath('userData'), 'nhan-vat', nvId);
  fs.mkdirSync(dir, { recursive: true });
  return ds.map((p) => {
    if (p.startsWith(dir)) return p;
    const dich = path.join(dir, `${Date.now().toString(36)}-${path.basename(p)}`);
    fs.copyFileSync(p, dich);
    return dich;
  });
}

// ── Lệnh từ giao diện ─────────────────────────────────────────────────────
const LENH = {
  trangThai: () => ({ ...trangThai(), nhatKy }),
  them: (p) => dieuPhoi.them(p),
  chay: () => dieuPhoi.chayTatCa(),
  dung: () => dieuPhoi.dungTatCa(),
  taoLai: ({ ids }) => dieuPhoi.taoLai(ids),
  xoaViec: ({ ids }) => dieuPhoi.xoaViec(ids),
  suaViec: ({ id, thay }) => dieuPhoi.suaViec(id, thay),
  taoDuAn: ({ ten }) => dieuPhoi.taoDuAn(ten),
  doiTenDuAn: ({ id, ten }) => dieuPhoi.doiTenDuAn(id, ten),
  xoaDuAn: ({ id }) => dieuPhoi.xoaDuAn(id),
  luuNhanVat: (nv) => {
    const id = nv.id || `nv-${Date.now().toString(36)}`;
    dieuPhoi.luuNhanVat({ id, ten: String(nv.ten || '').trim() || 'Nhân vật', moTa: nv.moTa || '',
      anh: chepAnhNhanVat(id, (nv.anh || []).filter((p) => fs.existsSync(p))) });
    return { ok: true, id };
  },
  xoaNhanVat: ({ id }) => {
    dieuPhoi.xoaNhanVat(id);
    try { fs.rmSync(path.join(app.getPath('userData'), 'nhan-vat', id), { recursive: true, force: true }); } catch (_) {}
  },
  luuMauPrompt: ({ ds }) => dieuPhoi.luuMauPrompt(ds),
  datCaiDat: (c) => dieuPhoi.datCaiDat(c),

  themTaiKhoan: ({ ten }) => { const a = taiKhoan.them(ten); baoTrangThai(); return a; },
  suaTaiKhoan: ({ id, thay }) => { taiKhoan.sua(id, thay); baoTrangThai(); },
  xoaTaiKhoan: async ({ id }) => {
    const r = taiKhoan.xoa(id);
    if (r.ok) { try { await session.fromPartition(r.taiKhoan.partition).clearStorageData(); } catch (_) {} }
    baoTrangThai();
    return r;
  },
  dangXuat: async ({ id }) => {
    const tk = taiKhoan.tim(id);
    if (!tk) return;
    await session.fromPartition(tk.partition).clearStorageData();
    taiKhoan.sua(id, { trangThai: 'can-dang-nhap' });
    log('warning', `🚪 Đã đăng xuất "${tk.ten}"`);
    baoTrangThai();
  },
  kiemTaiKhoan: ({ id }) => kiemTaiKhoan(id),
  moDangNhap: ({ id, khung }) => moDangNhap(id, khung),
  khungDangNhap: ({ khung }) => datKhungDangNhap(khung),
  dongDangNhap: () => dongDangNhap(true),
  xemLuong: ({ bat }) => {
    xemLuong = !!bat;
    for (const v of viewCuaLuong.values()) v.setVisible(xemLuong);
  },

  chonAnh: async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    return r.canceled ? [] : r.filePaths;
  },
  chonThuMucAnh: async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { thuMuc: r.filePaths[0], anh: anhTrongThuMuc(r.filePaths[0]) };
  },
  chonThuMucRa: async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    dieuPhoi.datCaiDat({ thuMucRa: r.filePaths[0] });
    return r.filePaths[0];
  },
  nhapPrompt: async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Văn bản', extensions: ['txt', 'csv', 'md'] }] });
    return r.canceled ? null : fs.readFileSync(r.filePaths[0], 'utf8');
  },
  luuBanSao: async ({ file }) => {
    if (!file || !fs.existsSync(file)) return { ok: false, loi: 'File không còn' };
    const r = await dialog.showSaveDialog(win, { defaultPath: path.basename(file) });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.copyFileSync(file, r.filePath);
    return { ok: true };
  },
  moFile: ({ file }) => shell.openPath(file),
  hienTrongThuMuc: ({ file }) => { if (file && fs.existsSync(file)) shell.showItemInFolder(file); },
  moThuMuc: ({ dir }) => { fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); },
  moThuMucDuLieu: () => shell.openPath(app.getPath('userData')),
  moLink: ({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
  tonTai: ({ files }) => (files || []).map((f) => fs.existsSync(f)),
  xoaNhatKy: () => { nhatKy.length = 0; },

  kiemCapNhat: () => capNhat && capNhat.kiemTra(),
  caiCapNhat: ({ epBuoc }) => capNhat && capNhat.caiDat({ moLai: true, epBuoc: !!epBuoc })
};

ipcMain.handle('app', async (_e, lenh, duLieu) => {
  const f = LENH[lenh];
  if (!f) return { ok: false, loi: `Lệnh lạ: ${lenh}` };
  try {
    const r = await f(duLieu || {});
    baoTrangThai();
    return r;
  } catch (err) {
    log('error', `Lỗi lệnh ${lenh}: ${err.message}`);
    return { ok: false, loi: err.message };
  }
});

// ── Cửa sổ ────────────────────────────────────────────────────────────────
function taoCuaSo() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    backgroundColor: '#120f24', title: `Muse Automation Studio ${pkg.version}`,
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon256.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'src/main/preload-ui.js'), contextIsolation: true, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'src/ui/index.html'));
  win.webContents.on('did-finish-load', () => baoTrangThai());
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'du-lieu.json'), (m) => log('warning', m));
  taiKhoan = new QuanLyTaiKhoan(store, log);
  dieuPhoi = new DieuPhoi({
    store, taiKhoan, taoLuong, huyLuong, docFile, ghiFile, log, bao: baoTrangThai,
    thuMucRaMacDinh: path.join(app.getPath('documents'), 'Muse Automation Studio')
  });

  capNhat = new BoCapNhat({
    phienBan: pkg.version, repo: layRepo(pkg), platform: process.platform, arch: process.arch,
    execPath: process.execPath, isPackaged: app.isPackaged, env: process.env,
    thuMuc: app.getPath('userData'), apiGoc: process.env.MUSE_UPDATE_API,
    fetch: (u, o) => net.fetch(u, o), spawn,
    execFile: (c, a) => new Promise((r, j) => execFile(c, a, (e, out) => (e ? j(e) : r(out)))),
    thoatApp: () => app.quit(), moFinder: (p) => shell.showItemInFolder(p), moLink: (u) => shell.openExternal(u),
    coTabDangChay: () => dieuPhoi.coViecDangChay(), log, gui: () => baoTrangThai()
  });

  taoCuaSo();
  log('info', `Muse Automation Studio ${pkg.version} đã mở. Dữ liệu: ${app.getPath('userData')}`);

  if (!process.env.MUSE_NO_UPDATE_CHECK) {
    setTimeout(() => capNhat.kiemTra({ imLang: true }), 5000);
    setInterval(() => capNhat.kiemTra({ imLang: true }), 4 * 3600 * 1000);
  }
  // Bài kiểm thử: MUSE_TEST=tests/<bài>.js nhận đúng các đối tượng app đang dùng.
  if (process.env.MUSE_TEST) require(path.resolve(process.env.MUSE_TEST))({ win, app, LENH, dieuPhoi, taiKhoan, nhatKy });
});

let dangThoat = false;
app.on('before-quit', (e) => {
  if (dangThoat) return;
  if (capNhat && capNhat.nenCaiKhiThoat()) {
    e.preventDefault();
    dangThoat = true;
    capNhat.caiDat({ moLai: false, epBuoc: true, thoat: true }).then((r) => { if (!r.ok) app.exit(0); });
    return;
  }
  try { dieuPhoi && dieuPhoi.dong(); } catch (_) {}
  try { store && store.close(); } catch (_) {}
});

app.on('window-all-closed', () => app.quit());
