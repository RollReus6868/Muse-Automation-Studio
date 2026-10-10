// ============================================================================
//  app.js — giao diện Muse Automation Studio (JS thuần, không cần build)
//  S = trạng thái tiến trình chính đẩy sang; U = trạng thái riêng của giao diện.
//  HD = src/main/hang-doi.js (dùng chung logic với tiến trình chính).
// ============================================================================
(function () {
  'use strict';
  const api = window.app;
  const $ = (s, g) => (g || document).querySelector(s);
  const $$ = (s, g) => Array.from((g || document).querySelectorAll(s));
  const KHOA = 'muse-studio-ui';

  let S = null;
  const U = Object.assign({
    trang: 'anh', duAn: '', loc: 'tat', tim: '', moiNhat: true, cheDo: 'tudo', tyLe: { anh: '9:16', video: '9:16' },
    nhap: { anh: '', video: '' }, tvLoc: 'tat', tvDuAn: '', chuoi: { bat: false, prompt: '', tyLe: '' }, promptThuMuc: ''
  }, docLuu());
  U.chon = new Set(); U.chiTiet = null; U.nvChon = new Set(); U.log = []; U.dangNhapMo = false;
  // Ảnh tham chiếu / thư mục ảnh RIÊNG cho từng trang: ảnh gắn ở trang video không được dính sang trang ảnh.
  U.tc = { anh: { ds: [], thuMuc: null }, video: { ds: [], thuMuc: null } };
  const TC = () => U.tc[loaiTrang()];

  function docLuu() { try { return JSON.parse(localStorage.getItem(KHOA)) || {}; } catch (_) { return {}; } }
  function luuUi() {
    try {
      localStorage.setItem(KHOA, JSON.stringify({ trang: U.trang, duAn: U.duAn, loc: U.loc, moiNhat: U.moiNhat, cheDo: U.cheDo,
        tyLe: U.tyLe, nhap: U.nhap, tvLoc: U.tvLoc, tvDuAn: U.tvDuAn, chuoi: U.chuoi, promptThuMuc: U.promptThuMuc }));
    } catch (_) {}
  }

  // ── Tiện ích ────────────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(window.ICON || {})[n] || ''}</svg>`;
  const ic = (n, cls) => `<i data-icon="${n}"${cls ? ` class="${cls}"` : ''}>${svg(n)}</i>`;
  function veIcon(goc) { for (const el of $$('i[data-icon]', goc)) if (!el.firstChild) el.innerHTML = svg(el.dataset.icon); }
  function fileUrl(p) {
    if (!p) return '';
    const x = String(p).replace(/\\/g, '/');
    return 'file://' + (x.startsWith('/') ? '' : '/') + encodeURI(x).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }
  /** Chỉ thay HTML khi thật sự khác — tránh video đang phát bị nạp lại mỗi lần trạng thái đổi. */
  function datHtml(el, html) {
    if (el.__html === html) return false;
    el.__html = html;
    el.innerHTML = html;
    return true;
  }
  const loaiTrang = () => (U.trang === 'video' ? 'video' : 'anh');
  const so3 = (n) => String(n).padStart(3, '0');
  function gio(t) {
    if (!t) return '';
    const d = new Date(t), nay = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === nay.toDateString() ? `Hôm nay, ${hm}` : `${d.getDate()}/${d.getMonth() + 1}, ${hm}`;
  }
  let henToast = null;
  function toast(chu, loi) {
    const t = $('#toast');
    t.textContent = chu; t.className = 'toast' + (loi ? ' loi' : ''); t.hidden = false;
    clearTimeout(henToast); henToast = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const duAnHienTai = () => (S && (S.duAn.find((d) => d.id === U.duAn) || S.duAn[0])) || null;
  const viecTheoId = (id) => S && S.viec.find((j) => j.id === id);

  // ── Hộp thoại (Electron không có window.prompt) ───────────────────────────
  async function hoi({ tieuDe, html, ok = 'OK', huy = 'Huỷ', nguyHiem = false }) {
    if (U.dangNhapMo) await dongDangNhap();     // trình duyệt đăng nhập là lớp native, che mất hộp thoại
    $('#hopTieuDe').textContent = tieuDe;
    $('#hopNoiDung').innerHTML = html || '';
    veIcon($('#hopNoiDung'));
    const nOk = $('#hopOk'), nHuy = $('#hopHuy');
    nOk.textContent = ok; nOk.className = 'nut-gradient' + (nguyHiem ? ' dung' : '');
    nHuy.textContent = huy; nHuy.hidden = !huy;
    $('#phu').hidden = false;
    const dau = $('#hopNoiDung input, #hopNoiDung textarea');
    if (dau) setTimeout(() => dau.focus(), 30);
    return new Promise((r) => {
      const xong = (v) => { $('#phu').hidden = true; nOk.onclick = nHuy.onclick = null; document.removeEventListener('keydown', phim); r(v); };
      const lay = () => {
        const o = {};
        for (const el of $$('#hopNoiDung [name]')) o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
        return o;
      };
      const phim = (e) => {
        if (e.key === 'Escape') xong(null);
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') xong(lay());
      };
      document.addEventListener('keydown', phim);
      nOk.onclick = () => xong(lay());
      nHuy.onclick = () => xong(null);
    });
  }
  const xacNhan = (tieuDe, chu, ok = 'Đồng ý', nguyHiem = false) =>
    hoi({ tieuDe, html: `<p>${chu}</p>`, ok, nguyHiem }).then((v) => !!v);

  // ── Điều hướng ──────────────────────────────────────────────────────────
  const TEN_TRANG = { anh: 'Tạo ảnh', video: 'Tạo video', nhanvat: 'Nhân vật', thuvien: 'Thư viện', taikhoan: 'Tài khoản', huongdan: 'Hướng dẫn', caidat: 'Cài đặt' };
  function diToi(trang) {
    if (U.trang === 'taikhoan' && trang !== 'taikhoan' && U.dangNhapMo) dongDangNhap();
    const cu = U.trang;
    U.trang = trang;
    for (const b of $$('#nav button')) b.classList.toggle('on', b.dataset.trang === trang);
    $('#tieuDeTrang').textContent = TEN_TRANG[trang];
    const tao = trang === 'anh' || trang === 'video';
    $('#trang-tao').hidden = !tao;
    for (const t of ['nhanvat', 'thuvien', 'taikhoan', 'huongdan', 'caidat']) $(`#trang-${t}`).hidden = t !== trang;
    $('#khuDuAn').style.visibility = tao ? 'visible' : 'hidden';
    if (tao) {
      if (cu !== trang) { U.chon.clear(); U.chiTiet = null; }
      const v = trang === 'video';
      $('#tieuDeTao').textContent = v ? 'Tạo video' : 'Tạo ảnh';
      $('#tieuDeHang').textContent = v ? 'Hàng đợi video' : 'Hàng đợi ảnh';
      $('#oPrompt').placeholder = v
        ? 'Mô tả video bạn muốn tạo (cảnh, chuyển động, âm thanh)…\nMỗi dòng là một prompt. Muse tạo clip khoảng 10 giây.'
        : 'Mô tả chi tiết ảnh bạn muốn tạo…\nMỗi dòng là một prompt. Gõ tên nhân vật (vd: Lan) để tự gửi kèm ảnh nhân vật.';
      $('#oPrompt').value = U.nhap[loaiTrang()] || '';
      for (const b of $$('#tyLe button')) b.classList.toggle('on', b.dataset.v === U.tyLe[loaiTrang()]);
      $('#promptVideoChung').value = U.chuoi.prompt;
      $('#promptThuMuc').value = U.promptThuMuc;
      $('#tyLeVideoChuoi').value = U.chuoi.tyLe;
    }
    if (trang === 'caidat') veCaiDat();
    luuUi();
    ve();
  }
  window.__diToi = diToi;   // cho bài chụp giao diện

  // ── Vẽ ──────────────────────────────────────────────────────────────────
  function ve() {
    if (!S) return;
    veTopbar();
    if (U.trang === 'anh' || U.trang === 'video') { veTao(); veHang(); veChiTiet(); }
    if (U.trang === 'nhanvat') veNhanVat();
    if (U.trang === 'thuvien') veThuVien();
    if (U.trang === 'taikhoan') veTaiKhoan();
  }

  function veTopbar() {
    const d = duAnHienTai();
    if (d && U.duAn !== d.id) U.duAn = d.id;
    const soViec = S.viec.filter((j) => j.duAn === (d && d.id) && j.loai === loaiTrang()).length;
    $('#tenDuAn').textContent = d ? `${d.ten} - ${soViec}` : '—';
    const dangChay = S.viec.filter((j) => j.trangThai === 'chay').length;
    const chip = $('#chipChay');
    chip.classList.toggle('chay', S.dangChay);
    chip.lastElementChild.textContent = S.dangChay ? `Đang chạy ${dangChay}` : 'Đang nghỉ';
    const homNay = new Date().toDateString();
    const xongHN = S.viec.filter((j) => j.trangThai === 'xong' && new Date(j.xongLuc).toDateString() === homNay);
    $('#chipHomNay').lastElementChild.textContent =
      `Hôm nay ${xongHN.filter((j) => j.loai === 'anh').length} ảnh · ${xongHN.filter((j) => j.loai === 'video').length} video`;
    const n = $('#nutChayTatCa');
    n.classList.toggle('dung', S.dangChay);
    n.innerHTML = S.dangChay ? `${ic('pause')}<span>Dừng</span>` : `${ic('play')}<span>Chạy tất cả</span>`;
    const cn = S.capNhat, c = $('#chipCapNhat');
    const coMoi = cn && ['co-ban-moi', 'dang-tai', 'da-tai'].includes(cn.trangThai) && cn.phienBanMoi;
    c.hidden = !coMoi;
    if (coMoi) c.lastElementChild.textContent = cn.trangThai === 'dang-tai'
      ? `Đang tải bản ${cn.phienBanMoi} · ${cn.tienDo}%` : `Có bản mới ${cn.phienBanMoi}`;
  }

  function veTao() {
    const ds = HD.tachPrompt($('#oPrompt').value, S.caiDat.tachPrompt);
    $('#demPrompt').textContent = `${ds.length} prompt · ${$('#oPrompt').value.length.toLocaleString('vi-VN')} ký tự`;
    const k = HD.chonKhoang(ds, $('#tuSo').value, $('#denSo').value);
    $('#ghiKhoang').textContent = ds.length && k.length < ds.length
      ? (k.length ? `Sẽ chạy prompt ${k[0].stt}–${k[k.length - 1].stt} (${k.length}/${ds.length})` : 'Khoảng prompt không hợp lệ') : '';
    $('#khuChuoi').hidden = loaiTrang() !== 'anh';
    $('#khuVideoThuMuc').hidden = loaiTrang() !== 'video';
    const tm = TC().thuMuc;
    $('#ghiVideoThuMuc').textContent = tm ? `${tm.anh.length} ảnh trong "${tm.thuMuc.split(/[\\/]/).pop()}" → ${tm.anh.length} video` : 'Chưa chọn';
    $('#batChuoi').checked = U.chuoi.bat;
    $('#khuPromptVideo').hidden = !U.chuoi.bat;
    if (document.activeElement !== $('#luongNhanh')) $('#luongNhanh').value = S.caiDat.luongMoiTK;
    veTaiVe();
    $('#tachPrompt').value = S.caiDat.tachPrompt;
    for (const b of $$('#cheDo button')) b.classList.toggle('on', b.dataset.v === U.cheDo);
    $('#khuNguoiMau').hidden = U.cheDo !== 'nguoimau';
    $('#chonNhanVat').innerHTML = S.nhanVat.length ? S.nhanVat.map((n) =>
      `<button class="chip-nv${U.nvChon.has(n.id) ? ' on' : ''}" data-nv="${esc(n.id)}">${n.anh[0] ? `<img src="${esc(fileUrl(n.anh[0]))}">` : ic('user-round')}${esc(n.ten)}</button>`).join('')
      : '<small>Chưa có nhân vật — thêm ở mục Nhân vật.</small>';
    let html = TC().ds.map((p, i) =>
      `<div class="anh-nho" title="${esc(p)}"><img src="${esc(fileUrl(p))}"><button data-bo="${i}">${ic('x')}</button></div>`).join('');
    if (TC().thuMuc) html += `<div class="ghi-thu-muc">${ic('folder-open')}<span>Thư mục: <b>${TC().thuMuc.anh.length} ảnh</b> → gán lần lượt cho từng prompt</span><button class="lien-ket" data-bo-thu-muc>Bỏ</button></div>`;
    $('#dsThamChieu').innerHTML = html;
  }

  const NHAN_BUOC = { 'mo-trang': 'Đang mở Muse', 'mo-lai': 'Mở lại chat cũ', gui: 'Đang gửi prompt', tai: 'Đang tải về' };
  function nhanTrangThai(j) {
    if (j.trangThai === 'xong') return ['xong', 'Hoàn tất', gio(j.xongLuc)];
    if (j.trangThai === 'loi') return ['loi', 'Lỗi', j.loi];
    if (j.trangThai === 'chay') {
      const b = j.buoc === 'tao' ? `Muse đang tạo ${j.loai === 'video' ? 'video' : 'ảnh'}` : (NHAN_BUOC[j.buoc] || 'Đang chuẩn bị');
      return ['chay', 'Đang chạy', b];
    }
    return ['cho', 'Đang chờ', j.thread ? 'Sẽ lấy tiếp kết quả' : (j.loi ? `Thử lại: ${j.loi}` : 'Trong hàng chờ')];
  }

  function locViec() {
    const d = duAnHienTai();
    const loai = loaiTrang();
    return S.viec.filter((j) => j.duAn === (d && d.id) && j.loai === loai);
  }

  function veHang() {
    const tatCa = locViec();
    const dem = { tat: tatCa.length, chay: 0, cho: 0, xong: 0, loi: 0 };
    for (const j of tatCa) dem[j.trangThai]++;
    const tabs = [['tat', 'Tất cả'], ['chay', 'Đang chạy'], ['cho', 'Đang chờ'], ['xong', 'Hoàn tất'], ['loi', 'Lỗi']]
      .filter(([k]) => k === 'tat' || dem[k] > 0 || U.loc === k);
    $('#tabsLoc').innerHTML = tabs.map(([k, t]) => `<button data-loc="${k}" class="${U.loc === k ? 'on' : ''}">${t} <b>${dem[k]}</b></button>`).join('');
    $('#nutSapXep').lastElementChild.textContent = U.moiNhat ? 'Mới nhất' : 'Cũ nhất';

    const tim = U.tim.trim().toLowerCase().replace(/^#/, '');
    let ds = tatCa.filter((j) => (U.loc === 'tat' || j.trangThai === U.loc) &&
      (!tim || String(j.so) === tim.replace(/^0+/, '') || j.prompt.toLowerCase().includes(tim)));
    ds.sort((a, b) => (U.moiNhat ? b.so - a.so : a.so - b.so));
    for (const id of [...U.chon]) if (!tatCa.some((j) => j.id === id)) U.chon.delete(id);
    $('#thanhChon').hidden = !U.chon.size;
    $('#soChon').textContent = `${U.chon.size} đã chọn`;
    // "Chọn tất cả" = mọi việc đang hiện theo bộ lọc / ô tìm.
    U.dsLoc = ds.map((j) => j.id);
    const soChonTrongLoc = U.dsLoc.filter((id) => U.chon.has(id)).length;
    $('#chonHet').checked = !!ds.length && soChonTrongLoc === ds.length;
    $('#chonHet').indeterminate = soChonTrongLoc > 0 && soChonTrongLoc < ds.length;

    const hop = $('#dsHang');
    if (!ds.length) {
      datHtml(hop, `<div class="trong">${ic(loaiTrang() === 'video' ? 'film' : 'image')}<div>${tatCa.length
        ? 'Không có việc nào khớp bộ lọc.' : 'Hàng đợi trống — dán prompt bên trái rồi bấm <b>Tạo &amp; chạy</b>.'}</div></div>`);
      return;
    }
    const cuon = hop.scrollTop;
    const MAX = 600;   // vẽ tối đa 600 dòng; nhiều hơn thì dùng ô tìm
    if (datHtml(hop, ds.slice(0, MAX).map(dongViec).join('') +
      (ds.length > MAX ? `<div class="trong" style="min-height:60px">Còn ${ds.length - MAX} việc nữa — dùng ô tìm để lọc.</div>` : ''))) hop.scrollTop = cuon;
    capNhatTienDo();
  }

  function thumbHtml(j) {
    const f = j.files && j.files[0];
    if (f && j.loai === 'video') return `<div class="thumb"><video src="${esc(fileUrl(f))}#t=0.5" preload="metadata" muted></video></div>`;
    if (f) return `<div class="thumb"><img loading="lazy" src="${esc(fileUrl(f))}"></div>`;
    if (j.thamChieu && j.thamChieu[0]) return `<div class="thumb"><img loading="lazy" style="opacity:.45" src="${esc(fileUrl(j.thamChieu[0]))}"></div>`;
    return `<div class="thumb">${ic(j.loai === 'video' ? 'film' : 'image')}</div>`;
  }

  function dongViec(j) {
    const [cls, nhan, phu] = nhanTrangThai(j);
    const chay = j.trangThai === 'chay';
    return `<div class="dong-viec${U.chiTiet === j.id ? ' chon' : ''}" data-id="${j.id}">
      <input type="checkbox" data-chon ${U.chon.has(j.id) ? 'checked' : ''}>
      <span class="so">#${so3(j.so)}</span>
      ${thumbHtml(j)}
      <div class="noi-dung">
        <div class="p" title="${esc(j.prompt)}">${j.so}. ${esc(j.prompt)}</div>
        <div class="the-nho"><span class="tag">${j.loai === 'video' ? 'VIDEO' : 'ẢNH'}</span><span class="tag">${esc(j.tyLe)}</span>${
          j.nhanVat && j.nhanVat.length ? `<span class="tag nv">${j.nhanVat.length} NV</span>` : ''}${
          j.tuAnh ? `<span class="tag nv" title="Video tạo từ ảnh">TỪ ẢNH</span>` : ''}${
          j.chuoi && !j.daNoiVideo ? `<span class="tag nv" title="Ảnh xong sẽ tự tạo video">→ VIDEO</span>` : ''}${
          chay ? `<div class="thanh-tien"><div style="width:0%"></div></div><span class="phan-tram">0%</span>` : ''}</div>
      </div>
      <div class="trang-thai"><span class="pill ${cls}">${nhan}</span><small title="${esc(phu)}">${esc(phu)}</small></div>
      <button class="ba-cham" data-menu title="Thêm">${ic('ellipsis-vertical')}</button>
    </div>`;
  }

  function capNhatTienDo() {
    if (!S) return;
    const now = Date.now();
    for (const el of $$('#dsHang .dong-viec')) {
      const j = viecTheoId(+el.dataset.id);
      if (!j || j.trangThai !== 'chay') continue;
      const p = HD.tienDoUoc(j, now, S.duKien[j.loai] || 40);
      const bar = $('.thanh-tien div', el), pt = $('.phan-tram', el);
      if (bar) bar.style.width = p + '%';
      if (pt) pt.textContent = p + '%';
    }
  }

  function veChiTiet() {
    const j = viecTheoId(U.chiTiet);
    const hop = $('#chiTiet');
    if (!j) {
      datHtml(hop, `<div class="xem-truoc trong"><div class="trong">${ic('sparkles')}<div>Chọn một dòng trong hàng đợi để xem kết quả.</div></div></div>`);
      return;
    }
    const f = j.files && j.files[0];
    const xem = f
      ? (j.loai === 'video' ? `<video src="${esc(fileUrl(f))}" controls loop></video>` : `<img src="${esc(fileUrl(f))}">`)
      : `<div class="trong">${ic(j.loai === 'video' ? 'film' : 'image')}<div>${j.trangThai === 'chay' ? 'Muse đang tạo…' : j.trangThai === 'loi' ? 'Chưa có kết quả' : 'Đang chờ đến lượt'}</div></div>`;
    const [cls, nhan] = nhanTrangThai(j);
    datHtml(hop, `
      <div class="xem-truoc">${xem}</div>
      <div class="ct-prompt">${j.so}. ${esc(j.prompt)}</div>
      <div class="ct-meta">#${so3(j.so)} · ${esc(gio(j.xongLuc || j.taoLuc))}${f && j.files.length > 1 ? ` · ${j.files.length} file` : ''}${j.tam ? ' · không tải về (chỉ trong app)' : ''}</div>
      <span class="pill ${cls}">${nhan}</span>
      ${j.loi && j.trangThai !== 'xong' ? `<div class="ct-loi">${esc(j.loi)}</div>` : ''}
      <div class="ct-nut">
        <button class="nut-vien" data-ct="xem" ${f ? '' : 'disabled'}>${ic('maximize-2')}${j.loai === 'video' ? 'Phát' : 'Xem'}</button>
        <button class="nut-vien" data-ct="thuMuc" ${f ? '' : 'disabled'}>${ic('folder')}Thư mục</button>
        <button class="nut-vien do" data-ct="xoa">${ic('x')}Xoá</button>
      </div>
      <div class="ct-dau"><span>Prompt</span><button class="nut-icon" data-ct="chep" title="Sao chép prompt">${ic('copy')}</button></div>
      <div class="ct-text">${esc(j.prompt)}</div>
      ${j.thamChieu && j.thamChieu.length ? `<div class="ct-dau"><span>Ảnh đính kèm</span></div><div class="ds-tham-chieu">${j.thamChieu.map((p) => `<div class="anh-nho"><img src="${esc(fileUrl(p))}"></div>`).join('')}</div>` : ''}
      <div class="ct-nut">
        <button class="nut-vien" data-ct="tai" ${f ? '' : 'disabled'}>${ic('download')}Tải xuống</button>
        <button class="nut-vien" data-ct="taoLai" ${j.trangThai === 'chay' ? 'disabled' : ''}>${ic('rotate-ccw')}Tạo lại</button>
        <button class="nut-gradient" data-ct="sua" ${j.trangThai === 'chay' ? 'disabled' : ''}>${ic('wand-sparkles')}Chỉnh sửa</button>
      </div>
      ${f && j.loai === 'anh' ? `<div class="ct-nut" style="grid-template-columns:1fr"><button class="nut-vien" data-ct="video">${ic('film')}Tạo video từ ảnh này</button></div>` : ''}`);
  }

  // ── Hành động trên việc ──────────────────────────────────────────────────
  async function hanhDong(lenh, j) {
    const f = j.files && j.files[0];
    if (lenh === 'xem' && f) moXemLon(f, j.loai);
    else if (lenh === 'thuMuc' && f) api.call('hienTrongThuMuc', { file: f });
    else if (lenh === 'tai' && f) { const r = await api.call('luuBanSao', { file: f }); if (r && r.ok) toast('Đã lưu bản sao'); }
    else if (lenh === 'chep') { await navigator.clipboard.writeText(j.prompt); toast('Đã sao chép prompt'); }
    else if (lenh === 'taoLai') {
      if (j.trangThai === 'xong' && !(await xacNhan('Tạo lại?', `Việc #${so3(j.so)} sẽ chạy lại từ đầu (gửi prompt mới), kết quả mới ghi đè file cũ.`, 'Tạo lại'))) return;
      await api.call('taoLai', { ids: [j.id] });
      toast(S.dangChay ? 'Đã đưa về hàng chờ' : 'Đã đưa về hàng chờ — bấm Chạy tất cả');
    } else if (lenh === 'xoa') {
      if (!(await xacNhan('Xoá việc?', `Xoá #${so3(j.so)} khỏi hàng đợi. File đã tải về vẫn giữ trong thư mục.`, 'Xoá', true))) return;
      await api.call('xoaViec', { ids: [j.id] });
      if (U.chiTiet === j.id) U.chiTiet = null;
    } else if (lenh === 'sua') {
      if (j.trangThai === 'xong' && j.loai === 'anh' && f) {
        const v = await hoi({ tieuDe: `Chỉnh sửa ảnh #${so3(j.so)}`, ok: 'Tạo & chạy',
          html: `<p>Muse sẽ nhận ảnh này làm tham chiếu và sửa theo yêu cầu (tạo thành việc mới).</p>
                 <label>Yêu cầu chỉnh sửa<textarea name="yc" rows="4" placeholder="vd: đổi nền thành bãi biển, giữ nguyên nhân vật"></textarea></label>` });
        if (!v || !v.yc.trim()) return;
        const r = await api.call('them', { duAn: j.duAn, loai: 'anh', prompts: [v.yc.trim()], tyLe: j.tyLe, thamChieu: [f], chay: true });
        if (r && r.ok) toast('Đã thêm việc chỉnh sửa'); else toast((r && r.loi) || 'Không thêm được', true);
      } else {
        const v = await hoi({ tieuDe: `Sửa prompt #${so3(j.so)}`, ok: 'Lưu',
          html: `<label>Prompt<textarea name="p" rows="6">${esc(j.prompt)}</textarea></label>
                 <label>Tỷ lệ<select name="t">${HD.TY_LE.map((t) => `<option ${t === j.tyLe ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` });
        if (!v) return;
        await api.call('suaViec', { id: j.id, thay: { prompt: v.p, tyLe: v.t } });
        if (j.trangThai !== 'cho' && await xacNhan('Chạy lại?', 'Đưa việc này về hàng chờ để tạo lại với prompt mới?', 'Tạo lại')) {
          await api.call('taoLai', { ids: [j.id] });
        }
      }
    } else if (lenh === 'video' && f) {
      U.tc.video = { ds: [f], thuMuc: null };
      U.tyLe.video = j.tyLe;
      diToi('video');
      $('#oPrompt').focus();
      toast(`Đã gắn ảnh #${so3(j.so)} làm khung đầu — nhập mô tả chuyển động rồi bấm Tạo & chạy`);
    }
  }

  function moMenuDong(nut, j) {
    dongMenu();
    const f = j.files && j.files[0];
    const m = document.createElement('div');
    m.className = 'menu menu-dong';
    m.innerHTML = [
      f ? `<button data-l="xem">${ic('eye')}Xem</button><button data-l="thuMuc">${ic('folder-open')}Mở thư mục</button>` : '',
      j.trangThai !== 'chay' ? `<button data-l="taoLai">${ic('rotate-ccw')}Tạo lại</button><button data-l="sua">${ic('pencil')}${f && j.loai === 'anh' ? 'Chỉnh sửa ảnh' : 'Sửa prompt'}</button>` : '',
      f && j.loai === 'anh' ? `<button data-l="video">${ic('film')}Tạo video từ ảnh này</button>` : '',
      `<button data-l="chep">${ic('copy')}Sao chép prompt</button><div class="tach"></div><button data-l="xoa" class="do">${ic('trash-2')}Xoá</button>`
    ].join('');
    document.body.appendChild(m);
    const r = nut.getBoundingClientRect();
    const h = m.offsetHeight, w = m.offsetWidth;
    m.style.left = Math.max(8, r.right - w) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-l]');
      if (!b) return;
      dongMenu();
      hanhDong(b.dataset.l, j);
    });
  }
  function dongMenu() {
    for (const m of $$('.menu-dong')) m.remove();
    for (const m of ['#menuDuAn', '#menuDuAnThem', '#menuTao', '#menuMau']) $(m).hidden = true;
  }

  function moXemLon(f, loai) {
    $('#xemLonNoiDung').innerHTML = loai === 'video'
      ? `<video src="${esc(fileUrl(f))}" controls autoplay loop></video>` : `<img src="${esc(fileUrl(f))}">`;
    $('#xemLon').hidden = false;
  }

  // ── Tạo việc ─────────────────────────────────────────────────────────────
  /**
   * Mọi tuỳ chọn của cột Tạo (trừ danh sách prompt và dự án) — dùng chung cho "Tạo & chạy"
   * và "Nhập nhiều file .txt". hoiLech: hỏi khi số ảnh trong thư mục lệch số prompt.
   * Trả null nếu người dùng huỷ hoặc thiếu thông tin.
   */
  async function thamSoTao(prompts, hoiLech) {
    const loai = loaiTrang();
    let chuoi = null;
    if (loai === 'anh' && U.chuoi.bat) {
      if (!U.chuoi.prompt.trim()) { toast('Đang bật "Ảnh xong → tự tạo video" nhưng chưa nhập prompt video', true); $('#promptVideoChung').focus(); return null; }
      chuoi = { prompt: U.chuoi.prompt, tyLe: U.chuoi.tyLe };
    }
    let theoDong = null;
    if (TC().thuMuc) {
      const n = TC().thuMuc.anh.length;
      if (hoiLech && n !== prompts.length && !(await xacNhan('Số ảnh và số prompt lệch nhau',
        `Thư mục có <b>${n}</b> ảnh nhưng có <b>${prompts.length}</b> prompt. Ảnh được gán lần lượt theo thứ tự; ${n < prompts.length ? 'prompt thừa sẽ không có ảnh' : 'ảnh thừa bị bỏ qua'}.`, 'Vẫn tạo'))) return null;
      theoDong = prompts.map((_, i) => (TC().thuMuc.anh[i] ? [TC().thuMuc.anh[i]] : []));
    }
    return {
      loai, tyLe: U.tyLe[loai], thamChieu: TC().ds, thamChieuTheoDong: theoDong,
      nhanVatIds: U.cheDo === 'nguoimau' ? [...U.nvChon] : [], tuNhanVat: $('#tuNhanVat').checked,
      soBan: $('#soBan').value, hauTo: $('#hauTo').value, tuSo: $('#tuSo').value, denSo: $('#denSo').value,
      chuoiVideo: chuoi
    };
  }

  async function taoViec(chay) {
    const loai = loaiTrang();
    let prompts = HD.tachPrompt($('#oPrompt').value, $('#tachPrompt').value);
    // Video từ thư mục ảnh: ô prompt dùng chung (hoặc ô Prompt có 0–1 prompt) → mỗi ảnh một video cùng prompt.
    const chung = U.promptThuMuc.trim();
    if (loai === 'video' && TC().thuMuc && (chung || prompts.length <= 1)) {
      const p0 = chung || prompts[0] || HD.PROMPT_VIDEO_MAC_DINH;
      prompts = TC().thuMuc.anh.map(() => p0);
    }
    if (!prompts.length) { toast('Chưa có prompt nào', true); $('#oPrompt').focus(); return; }
    const ts = await thamSoTao(prompts, true);
    if (!ts) return;
    const r = await api.call('them', { ...ts, duAn: U.duAn, prompts, chay });
    if (!r || !r.ok) { toast((r && r.loi) || 'Không thêm được', true); return; }
    $('#oPrompt').value = ''; U.nhap[loai] = ''; luuUi();
    U.loc = 'tat';
    toast(`Đã thêm ${r.so} việc${chay ? ' và bắt đầu chạy' : ' vào hàng đợi'}${ts.chuoiVideo ? ' — ảnh xong sẽ tự tạo video' : ''}`);
  }

  /** Nhiều file .txt → mỗi file một dự án (tên theo tên file), cùng tuỳ chọn cột Tạo, rồi chạy. */
  async function nhapNhieuFile() {
    const ds = ((await api.call('nhapNhieuFile')) || [])
      .map((f) => ({ ...f, prompts: HD.tachPrompt(f.noiDung, $('#tachPrompt').value) }));
    if (!ds.length) return;
    const rong = ds.filter((f) => !f.prompts.length);
    const dung = ds.filter((f) => f.prompts.length);
    if (!dung.length) { toast('Các file chọn đều không có prompt nào', true); return; }
    const k = (f) => HD.chonKhoang(f.prompts, $('#tuSo').value, $('#denSo').value).length;
    const tong = dung.reduce((n, f) => n + k(f), 0);
    const ok = await xacNhan(`Tạo ${dung.length} dự án mới?`,
      `Mỗi file thành một dự án (tên theo tên file) với tuỳ chọn đang chọn ở cột ${loaiTrang() === 'video' ? 'Tạo video' : 'Tạo ảnh'}, tổng <b>${tong}</b> ${loaiTrang() === 'video' ? 'video' : 'ảnh'}:<br>` +
      dung.map((f) => `• <b>${esc(f.ten)}</b> — ${k(f)} prompt`).join('<br>') +
      (rong.length ? `<br><br>Bỏ qua (không có prompt): ${rong.map((f) => esc(f.ten)).join(', ')}` : ''), 'Tạo & chạy');
    if (!ok) return;
    const chung = await thamSoTao([], false);
    if (!chung) return;
    let dau = null, soViec = 0;
    for (const f of dung) {
      const d = await api.call('taoDuAn', { ten: f.ten });
      if (!d || !d.id) continue;
      dau = dau || d.id;
      const theoDong = TC().thuMuc ? f.prompts.map((_, i) => (TC().thuMuc.anh[i] ? [TC().thuMuc.anh[i]] : [])) : null;
      const r = await api.call('them', { ...chung, thamChieuTheoDong: theoDong, duAn: d.id, prompts: f.prompts, chay: false });
      if (r && r.ok) soViec += r.so;
      else toast(`"${f.ten}": ${(r && r.loi) || 'không thêm được'}`, true);
    }
    if (!soViec) return;
    if (dau) { U.duAn = dau; U.chiTiet = null; U.chon.clear(); U.loc = 'tat'; luuUi(); }
    await api.call('chay');
    toast(`Đã tạo ${dung.length} dự án, ${soViec} việc và bắt đầu chạy`);
  }

  function themThamChieu(ds) {
    const anh = ds.filter((p) => /\.(png|jpe?g|webp)$/i.test(p));
    if (!anh.length) { toast('Chỉ nhận ảnh png, jpg, webp', true); return; }
    for (const p of anh) if (!TC().ds.includes(p)) TC().ds.push(p);
    veTao();
  }

  // ── Nhân vật ─────────────────────────────────────────────────────────────
  function veNhanVat() {
    const hop = $('#dsNhanVat');
    if (!S.nhanVat.length) {
      hop.innerHTML = `<div class="trong" style="grid-column:1/-1">${ic('user-plus')}<div>Chưa có nhân vật. Bấm <b>Thêm nhân vật</b>, đặt tên (vd: Lan) và chọn 1–4 ảnh rõ mặt.</div></div>`;
      return;
    }
    datHtml(hop, S.nhanVat.map((n) => `<div class="the-nv">
      <div class="anhs">${n.anh.slice(0, 4).map((p) => `<img src="${esc(fileUrl(p))}">`).join('') || ''}</div>
      <h4>${esc(n.ten)}</h4><p>${esc(n.moTa || '')}</p>
      <div class="hang-nut"><button class="nut-vien nho" data-sua-nv="${esc(n.id)}">${ic('pencil')}Sửa</button><button class="nut-vien nho do" data-xoa-nv="${esc(n.id)}">${ic('trash-2')}Xoá</button></div>
    </div>`).join(''));
  }

  async function suaNhanVat(id) {
    const cu = S.nhanVat.find((n) => n.id === id) || { ten: '', moTa: '', anh: [] };
    let anh = [...cu.anh];
    const veAnh = () => {
      const h = $('#nvAnh');
      if (h) { h.innerHTML = anh.map((p, i) => `<div class="anh-nho"><img src="${esc(fileUrl(p))}"><button type="button" data-bo-anh="${i}">${ic('x')}</button></div>`).join(''); }
    };
    const p = hoi({ tieuDe: id ? 'Sửa nhân vật' : 'Thêm nhân vật', ok: 'Lưu', html: `
      <label>Tên (gõ đúng tên này trong prompt)<input name="ten" value="${esc(cu.ten)}" placeholder="vd: Lan"></label>
      <label>Mô tả ngắn (tuỳ chọn)<input name="moTa" value="${esc(cu.moTa)}" placeholder="vd: cô gái 20 tuổi, tóc ngắn"></label>
      <label>Ảnh (1–4 ảnh rõ mặt)</label><div class="ds-tham-chieu" id="nvAnh" style="margin-bottom:8px"></div>
      <button type="button" class="nut-vien nho" id="nvChonAnh">${ic('image-plus')}Chọn ảnh</button>` });
    veAnh();
    $('#nvChonAnh').onclick = async () => { const ds = await api.call('chonAnh'); anh = [...anh, ...ds].slice(0, 4); veAnh(); };
    $('#nvAnh').onclick = (e) => { const b = e.target.closest('[data-bo-anh]'); if (b) { anh.splice(+b.dataset.boAnh, 1); veAnh(); } };
    const v = await p;
    if (!v) return;
    if (!v.ten.trim()) { toast('Cần đặt tên nhân vật', true); return; }
    if (!anh.length) { toast('Cần ít nhất 1 ảnh', true); return; }
    await api.call('luuNhanVat', { id: id || '', ten: v.ten, moTa: v.moTa, anh });
    toast('Đã lưu nhân vật');
  }

  // ── Thư viện ─────────────────────────────────────────────────────────────
  function veThuVien() {
    const sel = $('#duAnThuVien');
    const opts = `<option value="">Tất cả dự án</option>` + S.duAn.map((d) => `<option value="${esc(d.id)}">${esc(d.ten)}</option>`).join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    sel.value = U.tvDuAn;
    for (const b of $$('#locThuVien button')) b.classList.toggle('on', b.dataset.v === U.tvLoc);
    const ds = S.viec.filter((j) => j.trangThai === 'xong' && j.files && j.files.length &&
      (U.tvLoc === 'tat' || j.loai === U.tvLoc) && (!U.tvDuAn || j.duAn === U.tvDuAn))
      .sort((a, b) => b.xongLuc - a.xongLuc).slice(0, 500);
    datHtml($('#dsThuVien'), ds.length ? ds.map((j) => `<div class="o-tv" data-tv="${j.id}" title="${esc(j.prompt)}">${
      j.loai === 'video' ? `<video src="${esc(fileUrl(j.files[0]))}#t=0.5" preload="metadata" muted></video>` : `<img loading="lazy" src="${esc(fileUrl(j.files[0]))}">`
    }<span>#${so3(j.so)} · ${j.loai === 'video' ? 'VIDEO' : 'ẢNH'}</span></div>`).join('')
      : `<div class="trong" style="grid-column:1/-1">${ic('layout-grid')}<div>Chưa có kết quả nào.</div></div>`);
  }

  // ── Tài khoản ────────────────────────────────────────────────────────────
  const NHAN_TK = { 'da-dang-nhap': ['xong', 'Đã đăng nhập'], 'can-dang-nhap': ['loi', 'Chưa đăng nhập'], 'chua-kiem': ['cho', 'Chưa kiểm'] };
  function veTaiKhoan() {
    $('#soLuongTK').textContent = S.caiDat.luongMoiTK;
    datHtml($('#dsTaiKhoan'), S.taiKhoan.map((a) => {
      const [cls, nhan] = NHAN_TK[a.trangThai] || NHAN_TK['chua-kiem'];
      const dang = S.dangNhap && S.dangNhap.id === a.id;
      return `<div class="the-tk">
        <div class="av">${esc((a.ten || '?').trim().charAt(0).toUpperCase())}</div>
        <div class="tt"><b>${esc(a.ten)}</b><span class="pill ${cls}">${nhan}</span>
          <div class="hang-nut">
            <button class="nut-vien nho" data-tk="dangNhap" data-id="${esc(a.id)}" ${dang ? 'disabled' : ''}>${ic('log-in')}Đăng nhập</button>
            <button class="nut-vien nho" data-tk="kiem" data-id="${esc(a.id)}">${ic('refresh-cw')}Kiểm tra</button>
            <button class="nut-vien nho" data-tk="doiTen" data-id="${esc(a.id)}">${ic('pencil')}</button>
            <button class="nut-vien nho" data-tk="dangXuat" data-id="${esc(a.id)}" title="Đăng xuất">${ic('log-out')}</button>
            <button class="nut-vien nho do" data-tk="xoa" data-id="${esc(a.id)}" title="Xoá">${ic('trash-2')}</button>
          </div></div>
        <label class="cong-tac" title="Dùng tài khoản này khi chạy"><input type="checkbox" data-tk-bat="${esc(a.id)}" ${a.bat ? 'checked' : ''}><span></span></label>
      </div>`;
    }).join(''));
    const tk = S.dangNhap && S.taiKhoan.find((a) => a.id === S.dangNhap.id);
    $('#tieuDeDangNhap').textContent = tk ? `Đăng nhập: ${tk.ten}` : 'Đăng nhập';
    $('#nutXongDangNhap').hidden = !tk;
    U.dangNhapMo = !!tk;
  }
  const khungTrinhDuyet = () => { const r = $('#oTrinhDuyet').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
  async function dongDangNhap() { U.dangNhapMo = false; await api.call('dongDangNhap'); }

  async function lenhTaiKhoan(lenh, id) {
    const a = S.taiKhoan.find((x) => x.id === id);
    if (!a) return;
    if (lenh === 'dangNhap') { U.dangNhapMo = true; await api.call('moDangNhap', { id, khung: khungTrinhDuyet() }); }
    else if (lenh === 'kiem') { toast(`Đang kiểm "${a.ten}"…`); const r = await api.call('kiemTaiKhoan', { id }); toast(r === 'da-dang-nhap' ? `"${a.ten}" đã đăng nhập` : `"${a.ten}" chưa đăng nhập`, r !== 'da-dang-nhap'); }
    else if (lenh === 'doiTen') {
      const v = await hoi({ tieuDe: 'Đổi tên tài khoản', html: `<label>Tên<input name="ten" value="${esc(a.ten)}"></label>`, ok: 'Lưu' });
      if (v && v.ten.trim()) api.call('suaTaiKhoan', { id, thay: { ten: v.ten } });
    } else if (lenh === 'dangXuat') {
      if (await xacNhan('Đăng xuất?', `Xoá phiên đăng nhập Muse của "${esc(a.ten)}" trong app.`, 'Đăng xuất', true)) api.call('dangXuat', { id });
    } else if (lenh === 'xoa') {
      if (await xacNhan('Xoá tài khoản?', `Xoá "${esc(a.ten)}" và phiên đăng nhập của nó khỏi app.`, 'Xoá', true)) {
        const r = await api.call('xoaTaiKhoan', { id });
        if (r && !r.ok) toast(r.loi, true);
      }
    }
  }

  // ── Cài đặt ──────────────────────────────────────────────────────────────
  function veCaiDat() {
    if (!S) return;
    const c = S.caiDat;
    $('#cdLuong').value = c.luongMoiTK; $('#cdNghi').value = c.nghiGiuaLanGui; $('#cdThuLai').value = c.tuThuLai; $('#cdChayLaiLoi').value = c.tuChayLaiLoi;
    $('#cdChoAnh').value = c.choAnhGiay; $('#cdChoVideo').value = c.choVideoGiay; $('#cdChoChu').value = c.choChuGiay;
    $('#cdPng').checked = !!c.png;
    $('#cdMauAnh').value = c.mau.anh; $('#cdMauVideo').value = c.mau.video;
    veCapNhat();
  }
  /** Ví dụ tên file ngay dưới ô mẫu tên — thấy liền kết quả khi gõ. */
  function viDuTen() {
    const loai = loaiTrang();
    const d = duAnHienTai() || { ten: 'Mặc định' };
    const mau = { so: 83, stt: 5, prompt: 'Tranh truyện người que tối giản bố cục dọc', taoLuc: Date.now(), loai };
    $('#ncViDu').textContent = 'Ví dụ: ' + HD.tenFile(d, mau, loai === 'video' ? 'video/mp4' : 'image/png', 0, $('#ncTen').value);
  }
  /** Khối "Tải về & tên file" trong Cài đặt nâng cao: hiện đúng phần của trang đang mở (ảnh / video). */
  function veTaiVe() {
    const v = loaiTrang() === 'video', c = S.caiDat;
    $('#ncNhanTai').textContent = v ? 'Tải video về' : 'Tải ảnh về';
    $('#ncNhanThuMuc').textContent = v ? 'Thư mục lưu video' : 'Thư mục lưu ảnh';
    $('#ncNhanTen').firstChild.textContent = v ? 'Tên file video' : 'Tên file ảnh';
    $('#ncTai').checked = v ? c.taiVideo : c.taiAnh;
    $('#ncThuMuc').value = S.thuMuc[loaiTrang()];
    if (document.activeElement !== $('#ncTen')) $('#ncTen').value = v ? c.tenVideo : c.tenAnh;
    viDuTen();
  }
  function veCapNhat() {
    const cn = S && S.capNhat;
    if (!cn) return;
    const t = {
      'chua-kiem': 'Chưa kiểm.', 'dang-kiem': 'Đang hỏi GitHub…', 'moi-nhat': `Đang dùng bản mới nhất (${cn.phienBanHienTai}).`,
      'co-ban-moi': `Có bản mới ${cn.phienBanMoi}.`, 'dang-tai': `Đang tải bản ${cn.phienBanMoi}: ${cn.tienDo}%`,
      'da-tai': `Bản ${cn.phienBanMoi} đã tải xong — bấm chip "Có bản mới" trên cùng để cài, hoặc app tự cài khi bạn thoát.`, loi: cn.loi || 'Lỗi'
    }[cn.trangThai] || '';
    $('#cdCapNhat').textContent = `Phiên bản ${S.phienBan}. ${t}${cn.lyDo && cn.kieu !== 'tu-dong' ? ' ' + cn.lyDo : ''}`;
  }

  // ── Nhật ký ──────────────────────────────────────────────────────────────
  const dongLogText = (d) => `${new Date(d.t).toLocaleTimeString('vi-VN')} ${d.chu}`;
  function themLog(d) {
    U.log.push(d);
    if (U.log.length > 600) U.log.splice(0, U.log.length - 600);
    $('#dongCuoi').textContent = d.chu;
    $('#dongCuoi').title = d.chu;
    if (!$('#nganLog').hidden) veLog();
    else if (d.muc === 'error') { U.loiChuaXem = (U.loiChuaXem || 0) + 1; veDemLoi(); }
  }
  /** Số lỗi mới từ lần mở nhật ký trước, hiện ngay trên nút Nhật ký. */
  function veDemLoi() {
    const b = $('#demLoiLog');
    b.hidden = !U.loiChuaXem;
    b.textContent = U.loiChuaXem > 99 ? '99+' : String(U.loiChuaXem || '');
  }
  function veLog() {
    const h = $('#dsLog');
    h.innerHTML = U.log.slice(-400).map((d) => `<div class="dong-log ${esc(d.muc)}"><span class="gio">${esc(new Date(d.t).toLocaleTimeString('vi-VN'))}</span> ${esc(d.chu)}</div>`).join('');
    h.scrollTop = h.scrollHeight;
  }

  // ── Dự án ────────────────────────────────────────────────────────────────
  function veMenuDuAn() {
    const m = $('#menuDuAn');
    m.innerHTML = S.duAn.map((d) => {
      const n = S.viec.filter((j) => j.duAn === d.id).length;
      return `<button data-du-an="${esc(d.id)}" class="${d.id === U.duAn ? 'on' : ''}">${ic('folder')}${esc(d.ten)} - ${n}</button>`;
    }).join('') + `<div class="tach"></div><button data-du-an-moi>${ic('plus')}Dự án mới…</button>`;
  }
  async function duAnMoi() {
    const v = await hoi({ tieuDe: 'Dự án mới', html: '<label>Tên dự án (cũng là tên thư mục kết quả)<input name="ten" placeholder="vd: Truyện người que"></label>', ok: 'Tạo' });
    if (!v || !v.ten.trim()) return;
    const d = await api.call('taoDuAn', { ten: v.ten });
    if (d && d.id) { U.duAn = d.id; U.chiTiet = null; U.chon.clear(); luuUi(); }
  }

  // ── Gắn sự kiện ──────────────────────────────────────────────────────────
  function ganSuKien() {
    $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-trang]'); if (b) diToi(b.dataset.trang); });

    // Thanh trên
    $('#nutChayTatCa').onclick = () => api.call(S && S.dangChay ? 'dung' : 'chay').then((r) => {
      if (r === false) toast(S.viec.some((j) => j.trangThai === 'cho') ? 'Chưa bật tài khoản nào — xem mục Tài khoản' : 'Không còn việc nào đang chờ', true);
    });
    $('#chipCapNhat').onclick = async () => {
      const cn = S.capNhat;
      if (cn.trangThai !== 'da-tai') { diToi('caidat'); return; }
      if (!(await xacNhan(`Cài bản ${cn.phienBanMoi}?`, 'App sẽ tắt, cài bản mới rồi tự mở lại. Việc đang chạy về hàng chờ và chạy tiếp được.', 'Cài & mở lại'))) return;
      let r = await api.call('caiCapNhat', { epBuoc: false });
      if (r && r.canXacNhan && await xacNhan('Đang có luồng chạy', r.lyDo, 'Vẫn cài', true)) r = await api.call('caiCapNhat', { epBuoc: true });
      if (r && !r.ok && r.lyDo && !r.canXacNhan) toast(r.lyDo, true);
    };
    $('#nutDuAn').onclick = (e) => { e.stopPropagation(); const m = $('#menuDuAn'); const an = m.hidden; dongMenu(); if (an) { veMenuDuAn(); m.hidden = false; } };
    $('#menuDuAn').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      dongMenu();
      if (b.hasAttribute('data-du-an-moi')) duAnMoi();
      else { U.duAn = b.dataset.duAn; U.chiTiet = null; U.chon.clear(); luuUi(); ve(); }
    };
    $('#nutThemDuAn').onclick = duAnMoi;
    $('#nutMoThuMucDuAn').onclick = () => api.call('moThuMuc', { dir: S.thuMuc[loaiTrang()] });
    $('#nutNhapPrompt').onclick = async () => {
      const t = await api.call('nhapPrompt');
      if (t == null) return;
      const o = $('#oPrompt');
      o.value = (o.value.trim() ? o.value.replace(/\s*$/, '\n') : '') + t.trim();
      U.nhap[loaiTrang()] = o.value; luuUi(); veTao();
      toast(`Đã nhập ${HD.tachPrompt(t, $('#tachPrompt').value).length} prompt`);
    };
    $('#nutNhapNhieu').onclick = nhapNhieuFile;
    $('#nutMenuDuAn').onclick = (e) => { e.stopPropagation(); const m = $('#menuDuAnThem'); const an = m.hidden; dongMenu(); m.hidden = !an; };
    $('#menuDuAnThem').onclick = async (e) => {
      const b = e.target.closest('[data-lenh]');
      if (!b) return;
      dongMenu();
      const d = duAnHienTai();
      if (b.dataset.lenh === 'doiTen') {
        const v = await hoi({ tieuDe: 'Đổi tên dự án', html: `<label>Tên<input name="ten" value="${esc(d.ten)}"></label><small>Kết quả mới sẽ lưu vào thư mục theo tên mới; file cũ giữ nguyên chỗ cũ.</small>`, ok: 'Lưu' });
        if (v && v.ten.trim()) api.call('doiTenDuAn', { id: d.id, ten: v.ten });
      } else if (b.dataset.lenh === 'xoaXong') {
        const ids = S.viec.filter((j) => j.duAn === d.id && j.loai === loaiTrang() && j.trangThai === 'xong').map((j) => j.id);
        if (ids.length && await xacNhan('Dọn danh sách?', `Bỏ ${ids.length} việc đã xong khỏi danh sách (file vẫn giữ trong thư mục).`, 'Dọn')) api.call('xoaViec', { ids });
      } else if (b.dataset.lenh === 'xoaDuAn') {
        if (await xacNhan('Xoá dự án?', `Xoá dự án "${esc(d.ten)}" và toàn bộ hàng đợi của nó. File đã tải về vẫn giữ.`, 'Xoá', true)) {
          const r = await api.call('xoaDuAn', { id: d.id });
          if (r && !r.ok) toast(r.loi, true); else { U.duAn = ''; luuUi(); }
        }
      }
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu, #nutDuAn, #nutMenuDuAn, #nutTaoMenu, #nutMauPrompt, [data-menu]')) dongMenu(); });

    // Cột tạo
    $('#cheDo').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { U.cheDo = b.dataset.v; luuUi(); veTao(); } };
    $('#chonNhanVat').onclick = (e) => { const b = e.target.closest('[data-nv]'); if (!b) return; const id = b.dataset.nv; U.nvChon.has(id) ? U.nvChon.delete(id) : U.nvChon.add(id); veTao(); };
    $('#oPrompt').addEventListener('input', () => { U.nhap[loaiTrang()] = $('#oPrompt').value; luuUi(); veTao(); });
    for (const id of ['#tuSo', '#denSo']) $(id).addEventListener('input', veTao);
    $('#batChuoi').onchange = (e) => { U.chuoi.bat = e.target.checked; luuUi(); veTao(); if (U.chuoi.bat) $('#promptVideoChung').focus(); };
    $('#promptVideoChung').addEventListener('input', (e) => { U.chuoi.prompt = e.target.value; luuUi(); });
    $('#promptThuMuc').addEventListener('input', (e) => { U.promptThuMuc = e.target.value; luuUi(); });
    $('#tyLeVideoChuoi').onchange = (e) => { U.chuoi.tyLe = e.target.value; luuUi(); };
    $('#luongNhanh').onchange = async (e) => {
      const n = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3));
      await api.call('datCaiDat', { luongMoiTK: n });
      toast(`Mỗi tài khoản chạy ${n} luồng${n > 6 ? ' — nhiều luồng dễ bị Muse giới hạn, theo dõi nhật ký' : ''}`);
    };
    $('#tachPrompt').onchange = () => { api.call('datCaiDat', { tachPrompt: $('#tachPrompt').value }); };
    $('#tyLe').onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      U.tyLe[loaiTrang()] = b.dataset.v; luuUi();
      for (const x of $$('#tyLe button')) x.classList.toggle('on', x === b);
    };
    $('#nutChonAnh').onclick = async () => themThamChieu(await api.call('chonAnh'));
    $('#thaAnh').onclick = async (e) => { if (!e.target.closest('a')) themThamChieu(await api.call('chonAnh')); };
    const chonThuMucAnh = async (e) => {
      e.stopPropagation();
      const r = await api.call('chonThuMucAnh');
      if (!r) return;
      if (!r.anh.length) { toast('Thư mục không có ảnh nào', true); return; }
      TC().thuMuc = r;
      // Trang video: ảnh trong thư mục CHÍNH là khung đầu của từng video → bỏ ảnh tham chiếu lẻ
      // (vd ảnh còn lại từ "Tạo video từ ảnh này"), nếu không mỗi video bị gửi kèm 2 ảnh.
      const boLe = loaiTrang() === 'video' && TC().ds.length;
      if (boLe) TC().ds = [];
      veTao();
      toast(loaiTrang() === 'video'
        ? `Thư mục có ${r.anh.length} ảnh — mỗi ảnh một video, dùng prompt ở ô "Prompt dùng chung"${boLe ? '. Đã bỏ ảnh tham chiếu lẻ.' : ''}`
        : `Thư mục có ${r.anh.length} ảnh — gán lần lượt cho từng prompt`);
    };
    $('#nutChonThuMuc').onclick = chonThuMucAnh;
    $('#nutVideoThuMuc').onclick = chonThuMucAnh;
    $('#chonHet').onchange = (e) => {
      for (const id of U.dsLoc || []) e.target.checked ? U.chon.add(id) : U.chon.delete(id);
      veHang();
    };
    const tha = $('#thaAnh');
    tha.addEventListener('dragover', (e) => { e.preventDefault(); tha.classList.add('keo'); });
    tha.addEventListener('dragleave', () => tha.classList.remove('keo'));
    tha.addEventListener('drop', (e) => {
      e.preventDefault(); tha.classList.remove('keo');
      themThamChieu(Array.from(e.dataTransfer.files).map((f) => api.duongDan(f)).filter(Boolean));
    });
    $('#dsThamChieu').onclick = (e) => {
      const b = e.target.closest('[data-bo]');
      if (b) { TC().ds.splice(+b.dataset.bo, 1); veTao(); }
      if (e.target.closest('[data-bo-thu-muc]')) { TC().thuMuc = null; veTao(); }
    };
    $('#nutTaoChay').onclick = () => taoViec(true);
    $('#nutTaoMenu').onclick = (e) => { e.stopPropagation(); const m = $('#menuTao'); const an = m.hidden; dongMenu(); m.hidden = !an; };
    $('#nutChiThem').onclick = () => { dongMenu(); taoViec(false); };
    $('#oPrompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) taoViec(true); });

    // Mẫu prompt
    $('#nutMauPrompt').onclick = (e) => {
      e.stopPropagation();
      const m = $('#menuMau'); const an = m.hidden; dongMenu();
      if (!an) return;
      m.innerHTML = (S.mauPrompt.length ? S.mauPrompt.map((x, i) =>
        `<button data-mau="${i}" title="${esc(x.noiDung)}">${ic('file-text')}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.ten)}</span><span class="lien-ket" data-xoa-mau="${i}">${ic('x')}</span></button>`).join('')
        : '<div class="rong">Chưa có mẫu nào.</div>') + `<div class="tach"></div><button data-luu-mau>${ic('plus')}Lưu nội dung ô Prompt thành mẫu…</button>`;
      veIcon(m);
      m.hidden = false;
    };
    $('#menuMau').onclick = async (e) => {
      const x = e.target.closest('[data-xoa-mau]');
      if (x) { e.stopPropagation(); const ds = [...S.mauPrompt]; ds.splice(+x.dataset.xoaMau, 1); api.call('luuMauPrompt', { ds }); dongMenu(); return; }
      const b = e.target.closest('[data-mau]');
      if (b) {
        dongMenu();
        const o = $('#oPrompt');
        o.value = (o.value.trim() ? o.value.replace(/\s*$/, '\n') : '') + S.mauPrompt[+b.dataset.mau].noiDung;
        U.nhap[loaiTrang()] = o.value; luuUi(); veTao(); o.focus();
        return;
      }
      if (e.target.closest('[data-luu-mau]')) {
        dongMenu();
        const nd = $('#oPrompt').value.trim();
        if (!nd) { toast('Ô Prompt đang trống', true); return; }
        const v = await hoi({ tieuDe: 'Lưu mẫu prompt', html: '<label>Tên mẫu<input name="ten" placeholder="vd: Tranh truyện người que 9:16"></label>', ok: 'Lưu' });
        if (v && v.ten.trim()) { api.call('luuMauPrompt', { ds: [...S.mauPrompt, { ten: v.ten.trim(), noiDung: nd }] }); toast('Đã lưu mẫu'); }
      }
    };

    // Hàng đợi
    $('#oTim').addEventListener('input', (e) => { U.tim = e.target.value; veHang(); });
    $('#tabsLoc').onclick = (e) => { const b = e.target.closest('[data-loc]'); if (b) { U.loc = b.dataset.loc; luuUi(); veHang(); } };
    $('#nutSapXep').onclick = () => { U.moiNhat = !U.moiNhat; luuUi(); veHang(); };
    $('#dsHang').addEventListener('click', (e) => {
      const dong = e.target.closest('.dong-viec');
      if (!dong) return;
      const id = +dong.dataset.id;
      if (e.target.matches('[data-chon]')) { e.target.checked ? U.chon.add(id) : U.chon.delete(id); veHang(); return; }
      const m = e.target.closest('[data-menu]');
      if (m) { e.stopPropagation(); moMenuDong(m, viecTheoId(id)); return; }
      U.chiTiet = id;
      for (const d of $$('#dsHang .dong-viec')) d.classList.toggle('chon', +d.dataset.id === id);
      veChiTiet();
    });
    $('#dsHang').addEventListener('dblclick', (e) => {
      const dong = e.target.closest('.dong-viec');
      const j = dong && viecTheoId(+dong.dataset.id);
      if (j && j.files && j.files[0]) moXemLon(j.files[0], j.loai);
    });
    $('#chonBo').onclick = () => { U.chon.clear(); veHang(); };
    $('#chonXoa').onclick = async () => {
      const ids = [...U.chon];
      if (await xacNhan('Xoá các việc đã chọn?', `Xoá ${ids.length} việc khỏi hàng đợi (file đã tải vẫn giữ).`, 'Xoá', true)) {
        await api.call('xoaViec', { ids }); U.chon.clear();
      }
    };
    $('#chonChayLai').onclick = async () => {
      const n = await api.call('taoLai', { ids: [...U.chon] });
      U.chon.clear();
      toast(`Đã đưa ${n} việc về hàng chờ`);
    };

    // Chi tiết
    $('#chiTiet').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ct]');
      const j = viecTheoId(U.chiTiet);
      if (b && j && !b.disabled) hanhDong(b.dataset.ct, j);
    });
    $('#nutPhongTo').onclick = () => { const j = viecTheoId(U.chiTiet); if (j && j.files && j.files[0]) moXemLon(j.files[0], j.loai); };
    $('#dongXemLon').onclick = () => { $('#xemLon').hidden = true; $('#xemLonNoiDung').innerHTML = ''; };
    $('#xemLon').addEventListener('click', (e) => { if (e.target.id === 'xemLon') $('#dongXemLon').click(); });

    // Nhân vật
    $('#nutThemNV').onclick = () => suaNhanVat('');
    $('#dsNhanVat').onclick = async (e) => {
      const s = e.target.closest('[data-sua-nv]'), x = e.target.closest('[data-xoa-nv]');
      if (s) suaNhanVat(s.dataset.suaNv);
      if (x) {
        const n = S.nhanVat.find((v) => v.id === x.dataset.xoaNv);
        if (n && await xacNhan('Xoá nhân vật?', `Xoá "${esc(n.ten)}".`, 'Xoá', true)) api.call('xoaNhanVat', { id: n.id });
      }
    };

    // Thư viện
    $('#locThuVien').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { U.tvLoc = b.dataset.v; luuUi(); veThuVien(); } };
    $('#duAnThuVien').onchange = (e) => { U.tvDuAn = e.target.value; luuUi(); veThuVien(); };
    $('#dsThuVien').onclick = (e) => { const o = e.target.closest('[data-tv]'); const j = o && viecTheoId(+o.dataset.tv); if (j) moXemLon(j.files[0], j.loai); };

    // Tài khoản
    $('#nutThemTK').onclick = async () => {
      const v = await hoi({ tieuDe: 'Thêm tài khoản Muse', html: '<label>Tên gợi nhớ<input name="ten" placeholder="vd: Muse 2"></label>', ok: 'Thêm' });
      if (!v) return;
      const a = await api.call('themTaiKhoan', { ten: v.ten });
      if (a && a.id && await xacNhan('Đăng nhập luôn?', `Mở muse.ai để đăng nhập "${esc(a.ten)}"?`, 'Đăng nhập')) lenhTaiKhoan('dangNhap', a.id);
    };
    $('#dsTaiKhoan').addEventListener('click', (e) => { const b = e.target.closest('[data-tk]'); if (b) lenhTaiKhoan(b.dataset.tk, b.dataset.id); });
    $('#dsTaiKhoan').addEventListener('change', (e) => {
      const c = e.target.closest('[data-tk-bat]');
      if (c) api.call('suaTaiKhoan', { id: c.dataset.tkBat, thay: { bat: c.checked } });
    });
    $('#nutXongDangNhap').onclick = () => dongDangNhap();
    const baoKhung = () => { if (U.dangNhapMo && U.trang === 'taikhoan') api.call('khungDangNhap', { khung: khungTrinhDuyet() }); };
    new ResizeObserver(baoKhung).observe($('#oTrinhDuyet'));
    window.addEventListener('resize', baoKhung);

    // Cài đặt
    // Tải về & tên file (Cài đặt nâng cao của cột Tạo) — lưu ngay, theo trang ảnh / video.
    const khoaTai = () => (loaiTrang() === 'video' ? { tai: 'taiVideo', ten: 'tenVideo' } : { tai: 'taiAnh', ten: 'tenAnh' });
    $('#ncTai').onchange = (e) => api.call('datCaiDat', { [khoaTai().tai]: e.target.checked });
    $('#ncTen').addEventListener('input', viDuTen);
    $('#ncTen').onchange = (e) => { api.call('datCaiDat', { [khoaTai().ten]: e.target.value }); toast('Đã lưu mẫu tên file'); };
    $('#ncChonThuMuc').onclick = async () => { const d = await api.call('chonThuMucRa', { loai: loaiTrang() }); if (d) $('#ncThuMuc').value = d; };
    $('#ncMoThuMuc').onclick = () => api.call('moThuMuc', { dir: S.thuMuc[loaiTrang()] });
    $('#cdMoDuLieu').onclick = () => api.call('moThuMucDuLieu');
    $('#cdKiemCapNhat').onclick = () => api.call('kiemCapNhat');
    $('#cdXemLuong').onchange = (e) => api.call('xemLuong', { bat: e.target.checked });
    $('#cdMauGoc').onclick = () => { $('#cdMauAnh').value = HD.MAU_MAC_DINH.anh; $('#cdMauVideo').value = HD.MAU_MAC_DINH.video; };
    $('#cdLuu').onclick = async () => {
      await api.call('datCaiDat', {
        luongMoiTK: $('#cdLuong').value, nghiGiuaLanGui: $('#cdNghi').value, tuThuLai: $('#cdThuLai').value, tuChayLaiLoi: $('#cdChayLaiLoi').value,
        choAnhGiay: $('#cdChoAnh').value, choVideoGiay: $('#cdChoVideo').value, choChuGiay: $('#cdChoChu').value,
        png: $('#cdPng').checked, mau: { anh: $('#cdMauAnh').value, video: $('#cdMauVideo').value }
      });
      veCaiDat();
      toast('Đã lưu cài đặt');
    };

    // Nhật ký
    $('#nutNhatKy').onclick = () => {
      const n = $('#nganLog'); n.hidden = !n.hidden;
      $('#nutNhatKy').classList.toggle('on', !n.hidden);
      if (!n.hidden) { veLog(); U.loiChuaXem = 0; veDemLoi(); }
    };
    $('#nutSaoChepLog').onclick = async () => { await navigator.clipboard.writeText(U.log.map(dongLogText).join('\n')); toast('Đã sao chép nhật ký'); };
    $('#nutXoaLog').onclick = () => { U.log = []; api.call('xoaNhatKy'); $('#dongCuoi').textContent = ''; veLog(); };
  }

  // ── Khởi động ────────────────────────────────────────────────────────────
  veIcon(document);
  ganSuKien();
  api.onState((s) => {
    S = s;
    ve();
    if (U.trang === 'caidat') veCapNhat();
  });
  api.onLog(themLog);
  api.call('trangThai').then((s) => {
    S = s;
    for (const d of s.nhatKy || []) themLog(d);
    diToi(TEN_TRANG[U.trang] ? U.trang : 'anh');
  });
  setInterval(capNhatTienDo, 1000);
})();
