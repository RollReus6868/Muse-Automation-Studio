'use strict';
// ============================================================================
//  tai-khoan.js — NHIỀU TÀI KHOẢN MUSE, MỖI TÀI KHOẢN MỘT PHIÊN RIÊNG
//  Mỗi tài khoản là một session partition 'persist:muse-<id>' — cookie và
//  storage tách hẳn nhau, nên nhiều tài khoản chạy cùng lúc không đá nhau ra.
//  Đăng nhập một lần, phiên được giữ trong thư mục dữ liệu của app.
// ============================================================================

const KHOA = 'taiKhoan';

function slugId(raw) {
  return String(raw || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tk';
}

class QuanLyTaiKhoan {
  constructor(store, log) {
    this.store = store;
    this.log = log || (() => {});
    const luu = store.get(KHOA)[KHOA];
    this.ds = Array.isArray(luu) && luu.length ? luu : [
      { id: 'tk-1', ten: 'Tài khoản 1', partition: 'persist:muse-tk-1', bat: true, trangThai: 'chua-kiem' }
    ];
    this.luu();
  }

  luu() { this.store.set({ [KHOA]: this.ds }); }
  list() { return this.ds.map((a) => ({ ...a })); }
  tim(id) { return this.ds.find((a) => a.id === id) || null; }
  dangBat() { return this.ds.filter((a) => a.bat); }

  them(ten) {
    const goc = slugId(ten || `tk-${this.ds.length + 1}`);
    let id = goc, n = 2;
    while (this.tim(id)) id = `${goc}-${n++}`;
    const a = { id, ten: String(ten || '').trim() || `Tài khoản ${this.ds.length + 1}`,
      partition: `persist:muse-${id}`, bat: true, trangThai: 'chua-kiem' };
    this.ds.push(a);
    this.luu();
    this.log('success', `👤 Đã thêm tài khoản "${a.ten}"`);
    return a;
  }

  sua(id, thay) {
    const a = this.tim(id);
    if (!a) return false;
    if (typeof thay.ten === 'string' && thay.ten.trim()) a.ten = thay.ten.trim();
    if (typeof thay.bat === 'boolean') a.bat = thay.bat;
    if (typeof thay.trangThai === 'string') a.trangThai = thay.trangThai;
    this.luu();
    return true;
  }

  xoa(id) {
    if (this.ds.length <= 1) return { ok: false, loi: 'Phải giữ lại ít nhất một tài khoản' };
    const i = this.ds.findIndex((a) => a.id === id);
    if (i < 0) return { ok: false, loi: 'Không tìm thấy tài khoản' };
    const [a] = this.ds.splice(i, 1);
    this.luu();
    this.log('warning', `🗑 Đã xoá tài khoản "${a.ten}"`);
    return { ok: true, taiKhoan: a };
  }
}

module.exports = { QuanLyTaiKhoan, slugId };
