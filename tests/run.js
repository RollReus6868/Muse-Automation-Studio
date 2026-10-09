'use strict';
// node tests/run.js — logic thuần + bộ điều phối với luồng giả + bài kiểm tĩnh soi mã nguồn.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const HD = require('../src/main/hang-doi');
const { DieuPhoi } = require('../src/main/dieu-phoi');
const { QuanLyTaiKhoan } = require('../src/main/tai-khoan');

let pass = 0;
const loi = [];
const choAsync = [];
function test(ten, fn) {
  try { fn(); pass++; console.log(`   ✓ ${ten}`); } catch (e) { loi.push(ten); console.log(`   ✗ ${ten}\n     ${e.message}`); }
}
function testAsync(ten, fn) {
  choAsync.push(Promise.resolve().then(fn).then(() => { pass++; console.log(`   ✓ ${ten}`); },
    (e) => { loi.push(ten); console.log(`   ✗ ${ten}\n     ${e.message}`); }));
}
/** Đọc nguồn, chuẩn hoá CRLF (máy build Windows checkout CRLF), bỏ dòng ghi chú. */
function docNguon(f, giuGhiChu) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  return giuGhiChu ? s : s.split('\n').filter((d) => !/^\s*(\/\/|\*|\/\*)/.test(d)).join('\n');
}

console.log('\n── hang-doi.js ───────────────────────────────');
test('tách prompt theo dòng (bỏ dòng trống, CRLF)', () => {
  assert.deepStrictEqual(HD.tachPrompt('a\r\n\r\n b \nc', 'dong'), ['a', 'b', 'c']);
});
test('tách prompt theo đoạn (prompt nhiều dòng)', () => {
  assert.deepStrictEqual(HD.tachPrompt('dòng 1\ndòng 2\n\n  \nđoạn 2', 'doan'), ['dòng 1\ndòng 2', 'đoạn 2']);
});
test('slug tên dự án tiếng Việt', () => {
  assert.strictEqual(HD.slugTen('Mặc định'), 'Mac_dinh');
  assert.strictEqual(HD.slugTen('Truyện người que #2'), 'Truyen_nguoi_que_2');
  assert.strictEqual(HD.slugTen('Đà Lạt'), 'Da_lat');
  assert.strictEqual(HD.slugTen('***'), 'Du_an');
});
test('tìm nhân vật: đúng nguyên từ, không phân biệt hoa thường', () => {
  const ds = [{ id: 1, ten: 'Lan' }, { id: 2, ten: 'Minh Anh' }, { id: 3, ten: '' }];
  assert.deepStrictEqual(HD.timNhanVat('lan đứng cạnh Minh Anh', ds).map((x) => x.id), [1, 2]);
  assert.deepStrictEqual(HD.timNhanVat('trời se lạnh, Lanh chanh', ds).map((x) => x.id), []);
  assert.deepStrictEqual(HD.timNhanVat('(Lan)', ds).map((x) => x.id), [1]);
});
test('câu lệnh: tỷ lệ + prompt + nhân vật + tham chiếu đánh số đúng', () => {
  const t = HD.taoTinNhan({ loai: 'anh', tyLe: '16:9', prompt: ' Lan ở biển ', thamChieu: ['a', 'b'] },
    [{ ten: 'Lan', moTa: 'tóc ngắn', anh: ['x', 'y'] }]);
  assert.ok(t.startsWith('Tạo 1 ảnh tỷ lệ 16:9: Lan ở biển'), t);
  assert.ok(t.includes('Nhân vật "Lan" là ảnh 1–2 đính kèm (tóc ngắn)'), t);
  assert.ok(t.includes('Dùng ảnh 3–4 đính kèm làm ảnh tham chiếu.'), t);
  assert.ok(!/\n\n/.test(t), 'không có dòng trống thừa');
});
test('câu lệnh video: ảnh đính kèm là khung hình đầu; không tham chiếu thì không có dòng thừa', () => {
  const v = HD.taoTinNhan({ loai: 'video', tyLe: '9:16', prompt: 'corgi', thamChieu: ['a'] }, []);
  assert.ok(v.startsWith('Tạo 1 video tỷ lệ 9:16: corgi'));
  assert.ok(v.includes('Dùng ảnh 1 đính kèm làm khung hình đầu'));
  const a = HD.taoTinNhan({ loai: 'anh', tyLe: '1:1', prompt: 'mèo', thamChieu: [] }, []);
  assert.strictEqual(a, 'Tạo 1 ảnh tỷ lệ 1:1: mèo\nChỉ trả về ảnh, không hỏi lại, không giải thích.');
});
test('câu lệnh theo mẫu người dùng', () => {
  assert.strictEqual(HD.taoTinNhan({ loai: 'anh', tyLe: '4:3', prompt: 'p' }, [], { anh: '[{tyLe}] {prompt}' }), '[4:3] p');
});
test('tên file: Mac_dinh/Mac_dinh_083.png, _2 khi nhiều file, đuôi theo mime', () => {
  const d = { ten: 'Mặc định' };
  assert.strictEqual(HD.tenFile(d, { so: 83 }, 'image/png', 0), 'Mac_dinh/Mac_dinh_083.png');
  assert.strictEqual(HD.tenFile(d, { so: 83 }, 'image/webp', 1), 'Mac_dinh/Mac_dinh_083_2.webp');
  assert.strictEqual(HD.tenFile(d, { so: 1200 }, 'video/mp4', 0), 'Mac_dinh/Mac_dinh_1200.mp4');
});
test('việc kế tiếp: cũ nhất trước, ưu tiên chat dở của mình, bỏ qua chat dở của người khác', () => {
  const ds = [
    { id: 1, trangThai: 'xong', taoLuc: 1 },
    { id: 2, trangThai: 'cho', taoLuc: 5 },
    { id: 3, trangThai: 'cho', taoLuc: 3, thread: 'x', taiKhoan: 'B' },
    { id: 4, trangThai: 'cho', taoLuc: 9, thread: 'y', taiKhoan: 'A' }
  ];
  assert.strictEqual(HD.viecKeTiep(ds).id, 3);
  assert.strictEqual(HD.viecKeTiep(ds, (j) => j.thread && j.taiKhoan === 'A').id, 4);
  assert.strictEqual(HD.viecKeTiep(ds, null, (j) => j.thread && j.taiKhoan !== 'A').id, 2);
  assert.strictEqual(HD.viecKeTiep([{ trangThai: 'loi' }]), null);
});
test('tiến độ ước: không bao giờ 100 khi chưa xong, tăng dần, ≥1', () => {
  const j = { trangThai: 'chay', batDauLuc: 1000 };
  let truoc = 0;
  for (const t of [0, 5, 20, 35, 60, 200, 5000]) {
    const p = HD.tienDoUoc(j, 1000 + t * 1000, 35);
    assert.ok(p >= truoc && p >= 1 && p <= 99, `t=${t} p=${p}`);
    truoc = p;
  }
  assert.strictEqual(HD.tienDoUoc({ trangThai: 'xong' }, 0, 35), 100);
  assert.strictEqual(HD.tienDoUoc({ trangThai: 'cho' }, 0, 35), 0);
});
test('thời gian dự kiến = trung bình việc xong gần đây', () => {
  assert.strictEqual(HD.thoiGianDuKien([], 'video'), 80);
  const ds = [{ loai: 'anh', trangThai: 'xong', batDauLuc: 1, xongLuc: 30001 }, { loai: 'anh', trangThai: 'xong', batDauLuc: 1, xongLuc: 50001 }];
  assert.strictEqual(HD.thoiGianDuKien(ds, 'anh'), 40);
});
test('Muse trả chữ: chỉ coi là lỗi khi không gõ, không có khung, đã đợi đủ', () => {
  const kq = { chu: 'Bạn muốn gì?', dangGo: false, soKhungAnh: 0, soKhungVideo: 0 };
  assert.ok(HD.laTraLoiChu(kq, 61, 60));
  assert.ok(!HD.laTraLoiChu(kq, 30, 60));
  assert.ok(!HD.laTraLoiChu({ ...kq, dangGo: true }, 99, 60));
  assert.ok(!HD.laTraLoiChu({ ...kq, soKhungVideo: 1 }, 99, 60), 'đã có khung video (đang nạp) thì chưa phải lỗi');
});
test('xong: ảnh cần ảnh, video cần video', () => {
  assert.ok(HD.daXong('anh', { soAnh: 1, soVideo: 0 }));
  assert.ok(!HD.daXong('video', { soAnh: 1, soVideo: 0 }));
});
test('thứ tự tự nhiên cho ảnh trong thư mục', () => {
  assert.deepStrictEqual(['anh10.png', 'anh2.png', 'Anh1.png'].sort(HD.soSanhTuNhien), ['Anh1.png', 'anh2.png', 'anh10.png']);
});

console.log('\n── dieu-phoi.js (luồng giả) ───────────────────');
function khoGia(duLieu) {
  const data = { ...(duLieu || {}) };
  return { data, get: (k) => { const o = {}; for (const x of [].concat(k)) if (data[x] !== undefined) o[x] = data[x]; return o; }, set: (o) => Object.assign(data, o) };
}
function dungDieuPhoi(o = {}) {
  const store = khoGia(o.duLieu);
  const tk = new QuanLyTaiKhoan(store, () => {});
  const nhatKy = [];
  const dp = new DieuPhoi({
    store, taiKhoan: tk, log: (m, c) => nhatKy.push(`[${m}] ${c}`), bao: () => {},
    taoLuong: o.taoLuong || (() => ({ ranh: true, dung() {} })), huyLuong: () => {},
    docFile: (p) => ({ ten: path.basename(p), mime: 'image/png', b64: 'AA==' }),
    ghiFile: o.ghiFile || (() => {}), thuMucRaMacDinh: '/ra'
  });
  clearInterval(dp.hen);
  return { dp, tk, store, nhatKy };
}
test('thêm: số bản, ảnh theo dòng, tự nhận nhân vật, số thứ tự liên tục theo dự án', () => {
  const { dp } = dungDieuPhoi();
  dp.nhanVat = [{ id: 'nv1', ten: 'Lan', anh: ['l.png'] }];
  const r = dp.them({ duAn: 'mac-dinh', loai: 'anh', prompts: ['Lan ở biển', 'mèo'], soBan: 2, tuNhanVat: true,
    thamChieu: ['chung.png'], thamChieuTheoDong: [['a1.png'], ['a2.png']], tyLe: '4:3', hauTo: 'điện ảnh' });
  assert.strictEqual(r.so, 4);
  assert.deepStrictEqual(dp.viec.map((j) => j.so), [1, 2, 3, 4]);
  assert.deepStrictEqual(dp.viec[0].nhanVat, ['nv1']);
  assert.deepStrictEqual(dp.viec[2].nhanVat, []);
  assert.deepStrictEqual(dp.viec[2].thamChieu, ['chung.png', 'a2.png']);
  assert.strictEqual(dp.viec[0].prompt, 'Lan ở biển điện ảnh');
  assert.strictEqual(dp.viec[0].tyLe, '4:3');
  assert.strictEqual(dp.them({ prompts: ['  '] }).ok, false);
});
test('chế độ Người mẫu: nhân vật chọn tay thắng tự nhận', () => {
  const { dp } = dungDieuPhoi();
  dp.nhanVat = [{ id: 'nv1', ten: 'Lan', anh: ['l.png'] }, { id: 'nv2', ten: 'Minh', anh: ['m.png'] }];
  dp.them({ prompts: ['Lan đi chơi'], nhanVatIds: ['nv2', 'khong-co'], tuNhanVat: true });
  assert.deepStrictEqual(dp.viec[0].nhanVat, ['nv2']);
});
test('mở app: việc đang chạy lúc tắt → về hàng chờ, GIỮ thread', () => {
  const { dp } = dungDieuPhoi({ duLieu: { viec: [{ id: 5, so: 1, duAn: 'mac-dinh', trangThai: 'chay', thread: 'http://t/1', buoc: 'tao', nhanVat: [], files: [] }] } });
  assert.strictEqual(dp.viec[0].trangThai, 'cho');
  assert.strictEqual(dp.viec[0].thread, 'http://t/1');
  assert.strictEqual(dp.idMoi, 6);
});
test('kết thúc lỗi: thử lại lần 1 giữ chat (nếu còn dùng được), lần sau gửi mới, hết lượt thì Lỗi', () => {
  const { dp } = dungDieuPhoi();
  dp.datCaiDat({ tuThuLai: 2 });
  dp.them({ prompts: ['a'] });
  const j = dp.viec[0];
  j.thread = 't1';
  dp._ketThuc(j, { ok: false, loi: 'quá giờ', giuThread: true }, null);
  assert.strictEqual(j.trangThai, 'cho'); assert.strictEqual(j.thread, 't1');
  dp._ketThuc(j, { ok: false, loi: 'quá giờ', giuThread: true }, null);
  assert.strictEqual(j.trangThai, 'cho'); assert.strictEqual(j.thread, '');
  dp._ketThuc(j, { ok: false, loi: 'quá giờ' }, null);
  assert.strictEqual(j.trangThai, 'loi'); assert.strictEqual(j.loi, 'quá giờ');
});
test('kết thúc: chưa đăng nhập → việc về hàng chờ, tài khoản bị đánh dấu', () => {
  const { dp, tk } = dungDieuPhoi();
  dp.them({ prompts: ['a'] });
  dp._ketThuc(dp.viec[0], { ok: false, canDangNhap: true }, tk.tim('tk-1'));
  assert.strictEqual(dp.viec[0].trangThai, 'cho');
  assert.strictEqual(tk.tim('tk-1').trangThai, 'can-dang-nhap');
  assert.strictEqual(dp.viec[0].thu, 0, 'không tính là một lần thử');
});
test('kết thúc thành công: ghi file đúng tên, đánh dấu tài khoản đã đăng nhập', () => {
  const ghi = [];
  const { dp, tk } = dungDieuPhoi({ ghiFile: (p, b) => ghi.push([p, b.length]) });
  dp.them({ prompts: ['a'] });
  dp._ketThuc(dp.viec[0], { ok: true, files: [{ mime: 'image/png', b64: 'AAAA' }, { mime: 'image/png', b64: 'AA==' }] }, tk.tim('tk-1'));
  assert.strictEqual(dp.viec[0].trangThai, 'xong');
  assert.deepStrictEqual(ghi.map((x) => path.relative('/ra', x[0]).replace(/\\/g, '/')), ['Mac_dinh/Mac_dinh_001.png', 'Mac_dinh/Mac_dinh_001_2.png']);
  assert.strictEqual(tk.tim('tk-1').trangThai, 'da-dang-nhap');
});
test('cài đặt bị kẹp trong khoảng an toàn; mẫu thiếu {prompt} trả về mẫu gốc', () => {
  const { dp } = dungDieuPhoi();
  dp.datCaiDat({ luongMoiTK: 99, nghiGiuaLanGui: -5, choAnhGiay: 'x', mau: { anh: 'không có chỗ prompt' } });
  assert.strictEqual(dp.caiDat.luongMoiTK, 12);
  assert.strictEqual(dp.caiDat.nghiGiuaLanGui, 0);
  assert.strictEqual(dp.caiDat.choAnhGiay, 240);
  assert.strictEqual(dp.caiDat.mau.anh, HD.MAU_MAC_DINH.anh);
});
test('dự án: không xoá dự án cuối, xoá dự án xoá luôn việc của nó', () => {
  const { dp } = dungDieuPhoi();
  assert.strictEqual(dp.xoaDuAn('mac-dinh').ok, false);
  const d = dp.taoDuAn('Truyện người que');
  assert.strictEqual(d.id, 'truyen_nguoi_que');
  dp.them({ duAn: d.id, prompts: ['x'] });
  assert.strictEqual(dp.xoaDuAn(d.id).ok, true);
  assert.strictEqual(dp.viec.length, 0);
});
testAsync('điều phối: chia đủ luồng cho mỗi tài khoản bật, không giao một việc cho hai luồng', async () => {
  const daChay = [];
  const taoLuong = (a, stt) => ({
    id: `${a.id}-${stt}`, ranh: true, viec: null, dung() {},
    async chay(j) { this.ranh = false; this.viec = j; daChay.push([this.id, j.id]); await new Promise((r) => setTimeout(r, 20)); this.ranh = true; this.viec = null; return { ok: true, files: [{ mime: 'image/png', b64: 'AA==' }] }; }
  });
  const { dp, tk } = dungDieuPhoi({ taoLuong });
  tk.them('Hai');
  dp.datCaiDat({ luongMoiTK: 2, nghiGiuaLanGui: 0 });
  dp.them({ prompts: ['1', '2', '3', '4', '5', '6', '7'] });
  dp.chayTatCa();
  for (let i = 0; i < 40 && dp.dangChay; i++) { dp._vong(); await new Promise((r) => setTimeout(r, 30)); }
  dp._vong();   // nhịp kế tiếp của bộ hẹn giờ 1 giây: dọn luồng
  assert.strictEqual(dp.luong.length, 0, 'chạy xong thì dọn luồng');
  assert.strictEqual(new Set(daChay.map((x) => x[1])).size, 7);
  assert.strictEqual(daChay.length, 7, 'mỗi việc chạy đúng 1 lần');
  assert.ok(dp.viec.every((j) => j.trangThai === 'xong'));
  assert.deepStrictEqual([...new Set(daChay.slice(0, 4).map((x) => x[0]))].sort(), ['hai-1', 'hai-2', 'tk-1-1', 'tk-1-2']);
});
testAsync('giãn nhịp gửi theo tài khoản: hai luồng cùng tài khoản không gửi cùng lúc', async () => {
  const { dp } = dungDieuPhoi();
  dp.datCaiDat({ nghiGiuaLanGui: 1 });
  const t0 = Date.now();
  await Promise.all([dp.choGui('A'), dp.choGui('A'), dp.choGui('B')]);
  const ms = Date.now() - t0;
  assert.ok(ms >= 950 && ms < 1800, `mất ${ms}ms`);
});

console.log('\n── kiểm tĩnh ─────────────────────────────────');
test('mọi lệnh giao diện gọi đều có trong LENH của main.js', () => {
  const ui = docNguon('src/ui/app.js');
  const goi = new Set([...ui.matchAll(/api\.call\('([a-zA-Z]+)'/g)].map((m) => m[1]));
  const main = docNguon('main.js');
  const khoi = main.slice(main.indexOf('const LENH = {'), main.indexOf("ipcMain.handle('app'"));
  const thieu = [...goi].filter((l) => !new RegExp(`\\n\\s+${l}:`).test(khoi));
  assert.deepStrictEqual(thieu, []);
  assert.ok(goi.size > 30, `chỉ thấy ${goi.size} lệnh — regex hỏng?`);
});
test('mọi id giao diện app.js dùng ($("#x")) đều có trong index.html', () => {
  const ui = docNguon('src/ui/app.js');
  const html = docNguon('src/ui/index.html', true);
  const ids = new Set([...ui.matchAll(/\$\('#([A-Za-z0-9]+)['\s]/g)].map((m) => m[1]));
  // id có thể nằm trong index.html hoặc trong HTML hộp thoại app.js tự dựng.
  const thieu = [...ids].filter((id) => !html.includes(`id="${id}"`) && !ui.includes(`id="${id}"`));
  assert.deepStrictEqual(thieu, []);
});
test('mọi icon dùng đều có trong icons.js', () => {
  global.window = {};
  require('../src/ui/icons.js');
  const co = window.ICON;
  const dung = new Set([...docNguon('src/ui/index.html', true).matchAll(/data-icon="([a-z0-9-]+)"/g), ...docNguon('src/ui/app.js').matchAll(/ic\('([a-z0-9-]+)'/g)].map((m) => m[1]));
  assert.deepStrictEqual([...dung].filter((n) => !co[n]), []);
});
test('trang giả dùng đúng các thuộc tính trình trợ giúp dò (giữ hai bên khớp nhau)', () => {
  const tro = docNguon('src/inject/muse-trang.js', true);
  const gia = docNguon('tests/fixture-muse.html', true);
  const chuoi = new Set([...tro.matchAll(/(aria-label|data-testid|data-message-role)="([^"]+)"/g)].map((m) => m[2]));
  assert.ok(chuoi.size >= 10, `chỉ thấy ${chuoi.size}`);
  assert.deepStrictEqual([...chuoi].filter((c) => !gia.includes(c)), []);
});
test('trình trợ giúp kết thúc bằng undefined; (executeJavaScript không phải sao chép hàm)', () => {
  assert.ok(/\nundefined;\s*$/.test(docNguon('src/inject/muse-trang.js', true)));
});
test('trình viewer: mở thì luôn đóng (finally), kể cả khi không lấy được ảnh', () => {
  const s = docNguon('src/inject/muse-trang.js');
  const than = s.slice(s.indexOf('async function layFile('), s.indexOf('window.__muse ='));
  assert.ok(/moXem = x\.daMo/.test(than), 'đánh dấu đã mở theo daMo, không theo việc có ảnh');
  assert.ok(/finally \{\s*if \(moXem\) \{ dongTrinhXem\(\)/.test(than));
});
test('luồng chạy ngầm giữ kích thước thật (không thu 0×0)', () => {
  const m = docNguon('main.js');
  const than = m.slice(m.indexOf('function taoLuong('), m.indexOf('function huyLuong('));
  assert.ok(/width: 1280, height: 800/.test(than));
  assert.ok(!/width: 0/.test(than));
});
test('userData đặt TRƯỚC whenReady', () => {
  const m = docNguon('main.js');
  assert.ok(m.indexOf("app.setPath('userData'") < m.indexOf('app.whenReady()'));
});
test('package.json: tên file phát hành khớp bộ cập nhật, đủ thư mục đóng gói', () => {
  const pkg = JSON.parse(docNguon('package.json', true));
  assert.strictEqual(pkg.build.nsis.artifactName, 'MuseAutomationStudio-${version}-setup.exe');
  assert.strictEqual(pkg.build.mac.artifactName, 'MuseAutomationStudio-${version}-mac-${arch}.${ext}');
  assert.ok(pkg.build.files.includes('src/**/*') && pkg.build.files.includes('main.js'));
  assert.ok(/github\.com\/[^/]+\/[^/]+/.test(pkg.repository.url));
  assert.strictEqual(pkg.build.mac.identity, null);
});
test('RELEASE_NOTES / GHI_CHU_BAN_MOI nhắc đúng phiên bản', () => {
  const pkg = JSON.parse(docNguon('package.json', true));
  assert.ok(docNguon('GHI_CHU_BAN_MOI.md', true).includes(pkg.version));
});

Promise.all(choAsync).then(() => {
  console.log('\n──────────────────────────────────────────────');
  console.log(`KẾT QUẢ: ${pass}/${pass + loi.length} PASS`);
  if (loi.length) { console.log('HỎNG:\n - ' + loi.join('\n - ')); process.exit(1); }
});
