'use strict';
// ============================================================================
//  dieu-phoi.js — BỘ ĐIỀU PHỐI: giữ dự án, hàng đợi, nhân vật, cài đặt; chia
//  việc cho các luồng của mọi tài khoản đang bật; lưu file kết quả.
//
//  Không require('electron') — main.js đưa vào các hàm cần (tạo luồng, đọc/ghi
//  file) nên tests/e2e-main.js dựng được với trang Muse giả.
// ============================================================================

const path = require('path');
const hd = require('./hang-doi');

const CAI_DAT_MAC_DINH = {
  thuMucAnh: '',          // trống = Tài liệu/Muse Automation Studio
  thuMucVideo: '',
  taiAnh: true,           // tắt: file chỉ giữ trong bộ nhớ tạm của app (vẫn xem được, vẫn làm video được)
  taiVideo: true,
  tenAnh: hd.MAU_TEN_MAC_DINH,
  tenVideo: hd.MAU_TEN_MAC_DINH,
  luongMoiTK: 3,          // số luồng chạy song song mỗi tài khoản
  nghiGiuaLanGui: 3,      // giây nghỉ giữa 2 lần gửi prompt của CÙNG tài khoản
  choAnhGiay: 240,        // chờ tối đa một ảnh
  choVideoGiay: 600,      // chờ tối đa một video
  choChuGiay: 60,         // Muse trả chữ không kèm ảnh bao lâu thì coi là hỏi lại (video ×2)
  tuThuLai: 1,            // tự thử lại mấy lần khi lỗi (ngay lúc lỗi)
  tuChayLaiLoi: 2,        // hết hàng chờ mà còn việc lỗi → tự đưa về chạy lại, tối đa mấy lượt
  png: true,              // đổi ảnh webp của Muse sang png
  tachPrompt: 'dong',     // 'dong' | 'doan'
  mau: { ...hd.MAU_MAC_DINH }
};

class DieuPhoi {
  /**
   * @param o.store, o.taiKhoan (QuanLyTaiKhoan)
   * @param o.taoLuong(taiKhoan, stt) → Luong      o.huyLuong(luong)
   * @param o.docFile(duongDan) → {ten, mime, b64}
   * @param o.ghiFile(duongDanTuyetDoi, Buffer)
   * @param o.thuMucRaMacDinh   o.thuMucTam (file khi tắt tải về)   o.tonTai(p)
   * @param o.log(muc, chu)   o.bao()  (trạng thái đổi)
   */
  constructor(o) {
    this.o = o;
    const s = o.store.get(['duAn', 'viec', 'nhanVat', 'caiDat', 'mauPrompt']);
    this.duAn = Array.isArray(s.duAn) && s.duAn.length ? s.duAn
      : [{ id: 'mac-dinh', ten: 'Mặc định', so: 0, taoLuc: Date.now() }];
    this.viec = Array.isArray(s.viec) ? s.viec : [];
    this.nhanVat = Array.isArray(s.nhanVat) ? s.nhanVat : [];
    this.mauPrompt = Array.isArray(s.mauPrompt) ? s.mauPrompt : [];
    this.caiDat = { ...CAI_DAT_MAC_DINH, ...(s.caiDat || {}) };
    this.caiDat.mau = { ...hd.MAU_MAC_DINH, ...(this.caiDat.mau || {}) };
    // 1.0.0 có một thư mục chung "thuMucRa" → dùng làm thư mục cho cả ảnh lẫn video.
    if (this.caiDat.thuMucRa) {
      this.caiDat.thuMucAnh = this.caiDat.thuMucAnh || this.caiDat.thuMucRa;
      this.caiDat.thuMucVideo = this.caiDat.thuMucVideo || this.caiDat.thuMucRa;
      delete this.caiDat.thuMucRa;
    }
    // Việc đang chạy lúc app tắt → về hàng chờ, GIỮ thread để lấy lại kết quả.
    for (const j of this.viec) if (j.trangThai === 'chay') { j.trangThai = 'cho'; j.buoc = ''; }
    this.luong = [];          // [{luong, taiKhoanId}]
    this.lanGui = {};         // taiKhoanId → thời điểm gửi gần nhất
    this.dangChay = false;
    this.idMoi = this.viec.reduce((m, j) => Math.max(m, j.id || 0), 0) + 1;
    this.luu();
    this.hen = setInterval(() => this._vong(), 1000);
  }

  log(m, c) { this.o.log(m, c); }
  thuMucRa(loai) {
    return (loai === 'video' ? this.caiDat.thuMucVideo : this.caiDat.thuMucAnh) || this.o.thuMucRaMacDinh;
  }

  luu() {
    this.o.store.set({ duAn: this.duAn, viec: this.viec, nhanVat: this.nhanVat,
      caiDat: this.caiDat, mauPrompt: this.mauPrompt });
    this.o.bao();
  }

  trangThai() {
    return {
      duAn: this.duAn, viec: this.viec, nhanVat: this.nhanVat, caiDat: this.caiDat,
      mauPrompt: this.mauPrompt, dangChay: this.dangChay,
      thuMuc: { anh: this.thuMucRa('anh'), video: this.thuMucRa('video') },
      luong: this.luong.map((x) => ({ id: x.luong.id, taiKhoanId: x.taiKhoanId,
        viecId: x.luong.viec ? x.luong.viec.id : null })),
      duKien: { anh: hd.thoiGianDuKien(this.viec, 'anh'), video: hd.thoiGianDuKien(this.viec, 'video') }
    };
  }

  // ── Dự án ────────────────────────────────────────────────────────────────
  taoDuAn(ten) {
    const t = String(ten || '').trim() || `Dự án ${this.duAn.length + 1}`;
    let id = hd.slugTen(t).toLowerCase(), n = 2;
    while (this.duAn.some((d) => d.id === id)) id = `${hd.slugTen(t).toLowerCase()}-${n++}`;
    const d = { id, ten: t, so: 0, taoLuc: Date.now() };
    this.duAn.push(d);
    this.luu();
    return d;
  }
  doiTenDuAn(id, ten) {
    const d = this.duAn.find((x) => x.id === id);
    if (d && String(ten || '').trim()) { d.ten = String(ten).trim(); this.luu(); }
  }
  xoaDuAn(id) {
    if (this.duAn.length <= 1) return { ok: false, loi: 'Phải giữ lại ít nhất một dự án' };
    if (this.viec.some((j) => j.duAn === id && j.trangThai === 'chay')) return { ok: false, loi: 'Dự án đang có việc chạy' };
    this.duAn = this.duAn.filter((d) => d.id !== id);
    this.viec = this.viec.filter((j) => j.duAn !== id);
    this.luu();
    return { ok: true };
  }

  // ── Thêm việc ────────────────────────────────────────────────────────────
  /**
   * @param p { duAn, loai, prompts:[...], tyLe, thamChieu:[...] (dùng cho mọi prompt),
   *            thamChieuTheoDong:[[...],...] (ảnh thứ i cho prompt thứ i — theo số thứ tự GỐC),
   *            tuSo, denSo (chỉ chạy prompt từ số … đến số …, đếm từ 1),
   *            nhanVatIds:[...] (chế độ Người mẫu), tuNhanVat:bool, soBan, hauTo,
   *            chuoiVideo:{prompt, tyLe} (ảnh xong → tự tạo video từ ảnh đó), chay:bool }
   */
  them(p) {
    const d = this.duAn.find((x) => x.id === p.duAn) || this.duAn[0];
    const tatCa = (p.prompts || []).map((x) => String(x).trim()).filter(Boolean);
    if (!tatCa.length) return { ok: false, loi: 'Chưa có prompt nào' };
    const chon = hd.chonKhoang(tatCa, p.tuSo, p.denSo);
    if (!chon.length) return { ok: false, loi: `Khoảng prompt không hợp lệ (chỉ có ${tatCa.length} prompt)` };
    const soBan = Math.max(1, Math.min(10, parseInt(p.soBan, 10) || 1));
    const loai = p.loai === 'video' ? 'video' : 'anh';
    const cv = p.chuoiVideo && String(p.chuoiVideo.prompt || '').trim() && loai === 'anh'
      ? { prompt: String(p.chuoiVideo.prompt).trim(), tyLe: hd.TY_LE.includes(p.chuoiVideo.tyLe) ? p.chuoiVideo.tyLe : '' } : null;
    const moi = [];
    for (const { prompt: pr, stt } of chon) {
      const text = p.hauTo ? `${pr} ${String(p.hauTo).trim()}` : pr;
      let nv = (p.nhanVatIds || []).filter((id) => this.nhanVat.some((n) => n.id === id));
      if (!nv.length && p.tuNhanVat) nv = hd.timNhanVat(pr, this.nhanVat).map((n) => n.id);
      const thamChieu = [...(p.thamChieu || []), ...((p.thamChieuTheoDong && p.thamChieuTheoDong[stt - 1]) || [])];
      for (let b = 0; b < soBan; b++) {
        moi.push(this._viecMoi(d, { loai, prompt: text, stt, tyLe: p.tyLe, thamChieu, nhanVat: nv, chuoi: cv }));
      }
    }
    this.viec.push(...moi);
    this.luu();
    const khoang = chon.length < tatCa.length ? ` (prompt ${chon[0].stt}–${chon[chon.length - 1].stt})` : '';
    this.log('info', `➕ Thêm ${moi.length} việc ${loai === 'video' ? 'video' : 'ảnh'}${khoang} vào "${d.ten}"` +
      (cv ? ' — ảnh xong sẽ tự tạo video' : ''));
    if (p.chay) this.chayTatCa();
    return { ok: true, so: moi.length };
  }

  _viecMoi(d, v) {
    d.so += 1;
    return {
      id: this.idMoi++, duAn: d.id, so: d.so, stt: v.stt || d.so, loai: v.loai,
      prompt: v.prompt, tyLe: hd.TY_LE.includes(v.tyLe) ? v.tyLe : '9:16', thamChieu: v.thamChieu || [],
      nhanVat: v.nhanVat || [], chuoi: v.chuoi || null, tuAnh: v.tuAnh || 0,
      trangThai: 'cho', buoc: '', thread: '', taiKhoan: '', files: [], tam: false, loi: '', thu: 0,
      taoLuc: Date.now(), batDauLuc: 0, xongLuc: 0
    };
  }

  /** Ảnh vừa xong có hẹn "tự tạo video" → thêm việc video dùng ảnh đó làm khung đầu (chỉ một lần). */
  _noiVideo(j, d) {
    if (j.loai !== 'anh' || !j.chuoi || j.daNoiVideo || !j.files[0]) return;
    j.daNoiVideo = true;
    const v = this._viecMoi(d, { loai: 'video', prompt: j.chuoi.prompt, stt: j.stt, tyLe: j.chuoi.tyLe || j.tyLe,
      thamChieu: [j.files[0]], tuAnh: j.id });
    this.viec.push(v);
    this.log('info', `🎬 Ảnh #${j.so} xong → thêm video #${v.so} từ ảnh đó`);
  }

  /** Tạo lại: về hàng chờ, xoá chat cũ (gửi lại prompt mới tinh). */
  taoLai(ids) {
    let n = 0;
    for (const j of this.viec) {
      if (!ids.includes(j.id) || j.trangThai === 'chay') continue;
      Object.assign(j, { trangThai: 'cho', buoc: '', thread: '', taiKhoan: '', loi: '', thu: 0, batDauLuc: 0, xongLuc: 0, vongLai: 0 });
      n++;
    }
    this.luu();
    return n;
  }

  xoaViec(ids) {
    for (const x of this.luong) if (x.luong.viec && ids.includes(x.luong.viec.id)) x.luong.dung();
    this.viec = this.viec.filter((j) => !ids.includes(j.id));
    this.luu();
  }

  suaViec(id, thay) {
    const j = this.viec.find((x) => x.id === id);
    if (!j || j.trangThai === 'chay') return false;
    if (typeof thay.prompt === 'string' && thay.prompt.trim()) j.prompt = thay.prompt.trim();
    if (hd.TY_LE.includes(thay.tyLe)) j.tyLe = thay.tyLe;
    this.luu();
    return true;
  }

  // ── Nhân vật / mẫu prompt / cài đặt ──────────────────────────────────────
  luuNhanVat(nv) {
    const i = this.nhanVat.findIndex((x) => x.id === nv.id);
    if (i >= 0) this.nhanVat[i] = { ...this.nhanVat[i], ...nv }; else this.nhanVat.push(nv);
    this.luu();
  }
  xoaNhanVat(id) { this.nhanVat = this.nhanVat.filter((x) => x.id !== id); this.luu(); }
  luuMauPrompt(ds) { this.mauPrompt = Array.isArray(ds) ? ds : []; this.luu(); }

  datCaiDat(c) {
    const so = (v, min, max, md) => Math.max(min, Math.min(max, parseInt(v, 10) || md));
    const m = { ...this.caiDat, ...c };
    m.luongMoiTK = so(m.luongMoiTK, 1, 20, 3);
    for (const k of ['tenAnh', 'tenVideo']) m[k] = String(m[k] || '').trim() || hd.MAU_TEN_MAC_DINH;
    m.taiAnh = m.taiAnh !== false; m.taiVideo = m.taiVideo !== false;
    m.nghiGiuaLanGui = so(m.nghiGiuaLanGui, 0, 120, 3);
    m.choAnhGiay = so(m.choAnhGiay, 60, 1800, 240);
    m.choVideoGiay = so(m.choVideoGiay, 120, 3600, 600);
    m.choChuGiay = so(m.choChuGiay, 15, 600, 60);
    m.tuThuLai = Math.max(0, Math.min(5, parseInt(m.tuThuLai, 10) || 0));
    m.tuChayLaiLoi = Math.max(0, Math.min(10, parseInt(m.tuChayLaiLoi, 10) || 0));
    m.mau = { ...hd.MAU_MAC_DINH, ...(m.mau || {}) };
    for (const k of ['anh', 'video']) if (!String(m.mau[k] || '').includes('{prompt}')) m.mau[k] = hd.MAU_MAC_DINH[k];
    this.caiDat = m;
    this.luu();
  }

  // ── Chạy / dừng ──────────────────────────────────────────────────────────
  chayTatCa() {
    if (!this.o.taiKhoan.dangBat().length) {
      this.log('error', '⛔ Chưa bật tài khoản nào — vào mục Tài khoản bật ít nhất một.');
      return false;
    }
    if (!this.viec.some((j) => j.trangThai === 'cho')) {
      this.log('warning', 'Không còn việc nào đang chờ.');
      return false;
    }
    if (!this.dangChay) this.log('success', '▶ Bắt đầu chạy hàng chờ');
    this.dangChay = true;
    this.o.bao();
    this._vong();
    return true;
  }

  dungTatCa() {
    this.dangChay = false;
    for (const x of this.luong) x.luong.dung();
    this.log('warning', '⏸ Đã dừng — việc đang chạy về hàng chờ, chạy lại sẽ lấy tiếp kết quả từ chat cũ.');
    this.o.bao();
  }

  coViecDangChay() { return this.luong.some((x) => !x.luong.ranh); }

  /** Giãn nhịp gửi theo từng tài khoản (đặt chỗ đồng bộ nên không hai luồng cùng lọt). */
  async choGui(tkId) {
    for (;;) {
      const con = (this.lanGui[tkId] || 0) + this.caiDat.nghiGiuaLanGui * 1000 - Date.now();
      if (con <= 0) { this.lanGui[tkId] = Date.now(); return; }
      await new Promise((r) => setTimeout(r, Math.min(con, 500)));
    }
  }

  _canLuong() {
    const bat = this.o.taiKhoan.dangBat().filter((a) => a.trangThai !== 'can-dang-nhap');
    const muon = new Map(bat.map((a) => [a.id, this.caiDat.luongMoiTK]));
    // Bỏ luồng thừa (tài khoản tắt / giảm số luồng) khi chúng rảnh.
    for (const x of [...this.luong]) {
      const dem = this.luong.filter((y) => y.taiKhoanId === x.taiKhoanId).indexOf(x);
      if (x.luong.ranh && (!muon.has(x.taiKhoanId) || dem >= muon.get(x.taiKhoanId))) {
        this.luong.splice(this.luong.indexOf(x), 1);
        this.o.huyLuong(x.luong);
      }
    }
    for (const a of bat) {
      const co = this.luong.filter((x) => x.taiKhoanId === a.id).length;
      for (let i = co; i < muon.get(a.id); i++) {
        this.luong.push({ taiKhoanId: a.id, luong: this.o.taoLuong(a, i + 1) });
      }
    }
  }

  _vong() {
    if (!this.dangChay) {
      if (this.luong.length && !this.coViecDangChay()) {
        for (const x of this.luong) this.o.huyLuong(x.luong);
        this.luong = [];
        this.o.bao();
      }
      return;
    }
    this._canLuong();
    for (const x of this.luong) {
      if (!x.luong.ranh) continue;
      const chuConChay = (v) => v.thread && v.taiKhoan !== x.taiKhoanId &&
        this.luong.some((y) => y.taiKhoanId === v.taiKhoan);
      const j = hd.viecKeTiep(this.viec, (v) => v.thread && v.taiKhoan === x.taiKhoanId, chuConChay);
      if (!j) continue;
      // Chat dở của tài khoản KHÁC (đã tắt) → gửi lại từ đầu bằng tài khoản này.
      if (j.thread && j.taiKhoan !== x.taiKhoanId) j.thread = '';
      this._giao(x, j);
    }
    if (!this.viec.some((j) => j.trangThai === 'cho' || j.trangThai === 'chay') && !this.coViecDangChay()) {
      // Hết một lượt: việc lỗi còn lượt chạy lại → đưa về hàng chờ (gửi prompt mới) và chạy tiếp.
      const lai = this.viec.filter((j) => j.trangThai === 'loi' && (j.vongLai || 0) < this.caiDat.tuChayLaiLoi);
      if (lai.length) {
        for (const j of lai) {
          Object.assign(j, { trangThai: 'cho', buoc: '', thread: '', taiKhoan: '', thu: 0, batDauLuc: 0, xongLuc: 0, vongLai: (j.vongLai || 0) + 1 });
        }
        this.log('warning', `↻ Hết lượt — tự chạy lại ${lai.length} việc lỗi (lượt ${Math.max(...lai.map((j) => j.vongLai))}/${this.caiDat.tuChayLaiLoi})`);
        this.luu();
        return;
      }
      this.dangChay = false;
      this.log('success', '✅ [HỆ THỐNG] Đã chạy hết hàng chờ.');
      this.o.bao();
    } else if (!this.luong.length) {
      this.dangChay = false;
      this.log('error', '⛔ Không còn tài khoản nào dùng được (chưa đăng nhập?) — đã dừng.');
      this.o.bao();
    }
  }

  async _giao(x, j) {
    const tk = this.o.taiKhoan.tim(x.taiKhoanId);
    Object.assign(j, { trangThai: 'chay', taiKhoan: x.taiKhoanId, batDauLuc: j.thread ? (j.batDauLuc || Date.now()) : Date.now(), loi: '' });
    this.luu();
    const nv = j.nhanVat.map((id) => this.nhanVat.find((n) => n.id === id)).filter(Boolean);
    let files = [];
    try {
      if (!j.thread) {
        for (const n of nv) for (const a of n.anh || []) files.push(this.o.docFile(a));
        for (const a of j.thamChieu || []) files.push(this.o.docFile(a));
      }
    } catch (err) {
      this._ketThuc(j, { ok: false, loi: `Không đọc được ảnh đính kèm: ${err.message}` }, tk);
      return;
    }
    const cd = this.caiDat;
    const r = await x.luong.chay(j, {
      tinNhan: hd.taoTinNhan(j, nv, cd.mau),
      files,
      png: cd.png,
      choToiDaGiay: j.loai === 'video' ? cd.choVideoGiay : cd.choAnhGiay,
      choChuGiay: j.loai === 'video' ? cd.choChuGiay * 2 : cd.choChuGiay,
      choGui: () => this.choGui(x.taiKhoanId),
      capNhat: (thay) => { Object.assign(j, thay); this.luu(); }
    });
    this._ketThuc(j, r, tk);
  }

  _ketThuc(j, r, tk) {
    if (!this.viec.includes(j)) { this.o.bao(); return; }    // đã bị xoá giữa chừng
    const d = this.duAn.find((x) => x.id === j.duAn) || { ten: 'Du_an' };
    if (r.ok) {
      try {
        const video = j.loai === 'video';
        const tai = video ? this.caiDat.taiVideo : this.caiDat.taiAnh;
        const goc = tai ? this.thuMucRa(j.loai) : this.o.thuMucTam;
        const mau = video ? this.caiDat.tenVideo : this.caiDat.tenAnh;
        const cu = j.files || [];
        j.files = r.files.map((f, i) => {
          let dich = path.join(goc, hd.tenFile(d, j, f.mime, i, mau));
          // Đã có file trùng tên mà KHÔNG phải file cũ của chính việc này (Tạo lại) → thêm (2), (3)…,
          // không bao giờ ghi đè kết quả khác (kể cả của việc đã dọn khỏi danh sách).
          for (let n = 2; this.o.tonTai(dich) && !cu.includes(dich); n++) {
            dich = path.join(goc, hd.tenFile(d, j, f.mime, i, mau)).replace(/(\.[^.\\/]+)$/, ` (${n})$1`);
          }
          this.o.ghiFile(dich, Buffer.from(f.b64, 'base64'));
          return dich;
        });
        Object.assign(j, { trangThai: 'xong', buoc: '', xongLuc: Date.now(), loi: '', tam: !tai });
        this.log('success', `✅ [HỆ THỐNG] Việc #${j.so} xong ${video ? 'video' : 'ảnh'}: ` +
          (tai ? path.relative(goc, j.files[0]) : `${path.basename(j.files[0])} (không tải về — chỉ giữ trong app)`));
        this._noiVideo(j, d);
      } catch (err) {
        Object.assign(j, { trangThai: 'loi', buoc: '', loi: `Không ghi được file: ${err.message}` });
        this.log('error', `❌ #${j.so} ${j.loi}`);
      }
    } else if (r.dung) {
      Object.assign(j, { trangThai: 'cho', buoc: '' });
      if (!r.giuThread) j.thread = '';
    } else if (r.canDangNhap) {
      Object.assign(j, { trangThai: 'cho', buoc: '' });
      if (!r.giuThread) j.thread = '';
      if (tk && tk.trangThai !== 'can-dang-nhap') {
        this.o.taiKhoan.sua(tk.id, { trangThai: 'can-dang-nhap' });
        this.log('error', `🔒 Tài khoản "${tk.ten}" chưa đăng nhập Muse — tạm bỏ qua. Vào mục Tài khoản để đăng nhập.`);
      }
    } else {
      j.thu = (j.thu || 0) + 1;
      if (j.thu <= this.caiDat.tuThuLai) {
        // Lần thử lại đầu: nếu chat còn dùng được (hết giờ chờ…) thì chờ tiếp chat đó; sau đó gửi mới.
        if (!(r.giuThread && j.thu === 1)) j.thread = '';
        Object.assign(j, { trangThai: 'cho', buoc: '', loi: r.loi });
        this.log('warning', `↻ #${j.so} ${r.loi} — thử lại (${j.thu}/${this.caiDat.tuThuLai})`);
      } else {
        Object.assign(j, { trangThai: 'loi', buoc: '', loi: r.loi, xongLuc: Date.now() });
        this.log('error', `❌ #${j.so} ${r.loi}`);
      }
    }
    if (tk && r.ok && tk.trangThai !== 'da-dang-nhap') this.o.taiKhoan.sua(tk.id, { trangThai: 'da-dang-nhap' });
    this.luu();
  }

  dong() { clearInterval(this.hen); for (const x of this.luong) x.luong.dung(); }
}

module.exports = { DieuPhoi, CAI_DAT_MAC_DINH };
