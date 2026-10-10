'use strict';
// ============================================================================
//  luong.js — MỘT LUỒNG = một trang muse.ai chạy ngầm của một tài khoản.
//  Mỗi việc: mở chat phụ MỚI (/thread/new) → đính kèm ảnh → dán prompt → gửi
//  → chờ Muse trả ảnh/video → lấy file gốc. Chat mới cho mỗi việc nên không
//  bao giờ dính ngữ cảnh hay ảnh của prompt trước.
//
//  Việc đã có `thread` (dừng giữa chừng, tắt app) → mở lại đúng chat đó và chỉ
//  CHỜ LẤY KẾT QUẢ, không gửi lại prompt.
// ============================================================================

const hd = require('./hang-doi');

class Luong {
  /**
   * @param o.id, o.taiKhoan  ({id, ten, partition})
   * @param o.wc            webContents của trang chạy ngầm
   * @param o.nguon         mã trình trợ giúp src/inject/muse-trang.js
   * @param o.goc           địa chỉ gốc, mặc định https://muse.ai
   * @param o.log(muc, chu)
   */
  constructor(o) {
    Object.assign(this, { id: o.id, taiKhoan: o.taiKhoan, wc: o.wc, nguon: o.nguon,
      goc: (o.goc || 'https://muse.ai').replace(/\/$/, ''), log: o.log || (() => {}) });
    this.viec = null;
    this.huy = 0;
  }

  get ranh() { return !this.viec; }

  dung() { this.huy++; }

  async ngu(ms, huyLuc) {
    const het = Date.now() + ms;
    while (Date.now() < het) {
      if (this.huy !== huyLuc) return false;
      await new Promise((r) => setTimeout(r, Math.min(250, het - Date.now())));
    }
    return this.huy === huyLuc;
  }

  async moTrang(url) {
    try { await this.wc.loadURL(url); } catch (_) { /* SPA tự chuyển hướng → ERR_ABORTED, bỏ qua */ }
  }

  async goi(bieuThuc) {
    const co = await this.wc.executeJavaScript('!!(window.__muse && window.__muse.phienBan === 1)', true).catch(() => false);
    if (!co) await this.wc.executeJavaScript(this.nguon, true);
    return await this.wc.executeJavaScript(bieuThuc, true);
  }

  /**
   * Chạy một việc.
   * @param job
   * @param ctx { tinNhan, files:[{ten,mime,b64}], png, choToiDaGiay, choChuGiay,
   *              choGui():Promise (giãn nhịp theo tài khoản), capNhat(thay) }
   * @returns {ok, files} | {ok:false, loi, canDangNhap?, dung?, giuThread?}
   */
  async chay(job, ctx) {
    this.viec = job;
    const huyLuc = this.huy;
    try {
      return await this._chay(job, ctx, huyLuc);
    } catch (err) {
      return { ok: false, loi: `Lỗi luồng: ${err.message}`, giuThread: true };
    } finally {
      this.viec = null;
    }
  }

  async _chay(job, ctx, huyLuc) {
    const tiepTuc = !!job.thread;
    ctx.capNhat({ buoc: tiepTuc ? 'mo-lai' : 'mo-trang' });
    await this.moTrang(tiepTuc ? job.thread : `${this.goc}/thread/new`);

    // Chờ trang sẵn sàng: có ô nhập (đã đăng nhập) hoặc thấy màn đăng nhập.
    let tt = null;
    for (let i = 0; i < 120; i++) {
      tt = await this.goi('window.__muse.trangThai()').catch(() => null);
      if (tt && (tt.coONhap || tt.canDangNhap)) break;
      if (!(await this.ngu(250, huyLuc))) return { ok: false, dung: true, giuThread: true };
    }
    if (tt && tt.canDangNhap) return { ok: false, canDangNhap: true, loi: 'Tài khoản chưa đăng nhập Muse' };
    if (!tt || !tt.coONhap) return { ok: false, loi: 'Không mở được trang Muse (không thấy ô nhập)', giuThread: true };

    if (!tiepTuc) {
      await ctx.choGui();
      if (this.huy !== huyLuc) return { ok: false, dung: true };
      ctx.capNhat({ buoc: 'gui' });
      const r = await this.goi(`window.__muse.gui(${JSON.stringify({ text: ctx.tinNhan, files: ctx.files || [] })})`);
      if (!r || !r.ok) {
        if (r && r.loi === 'can-dang-nhap') return { ok: false, canDangNhap: true, loi: 'Tài khoản chưa đăng nhập Muse' };
        const GIAI_THICH = {
          'o-soan-tin-chua-nap': 'ô soạn tin của Muse không nạp xong sau 30 giây',
          'nut-gui-bi-tat': 'nút Gửi của Muse không bật được sau 60 giây',
          'gui-khong-an': 'bấm Gửi nhưng Muse không nhận',
          'khong-dinh-kem-duoc': 'không đính kèm được ảnh',
          'khong-dan-duoc-prompt': 'không dán được prompt vào ô soạn tin',
          'khong-thay-o-nhap': 'không thấy ô soạn tin'
        };
        const ma = r ? r.loi : '?';
        return { ok: false, loi: `Gửi prompt hỏng: ${GIAI_THICH[ma] || ma}${r && r.chu ? ` (${r.chu})` : ''}` };
      }
      ctx.capNhat({ thread: r.thread, buoc: 'tao' });
      this.log('info', `[${this.id}] #${job.so} đã gửi → ${r.thread}`);
    } else {
      ctx.capNhat({ buoc: 'tao' });
    }

    const het = Date.now() + ctx.choToiDaGiay * 1000;
    let coChuLuc = 0;
    let lanLoiTrang = 0;
    let lanLayHong = 0;
    while (Date.now() < het) {
      if (!(await this.ngu(3000, huyLuc))) return { ok: false, dung: true, giuThread: true };
      let kq;
      try {
        kq = await this.goi('window.__muse.ketQua()');
        lanLoiTrang = 0;
      } catch (err) {
        // Trang sập / đang nạp lại: mở lại chat rồi chờ tiếp, tối đa 3 lần liền.
        if (++lanLoiTrang > 3) return { ok: false, loi: `Trang Muse hỏng: ${err.message}`, giuThread: true };
        if (job.thread) await this.moTrang(job.thread);
        continue;
      }
      if (kq.canDangNhap) return { ok: false, canDangNhap: true, loi: 'Muse đòi đăng nhập lại', giuThread: true };

      if (hd.daXong(job.loai, kq)) {
        ctx.capNhat({ buoc: 'tai' });
        // Chờ chút cho các khung khác (nếu Muse trả nhiều) nạp xong.
        await this.ngu(1500, huyLuc);
        const files = await this.goi(`window.__muse.layFile(${JSON.stringify({ png: !!ctx.png })})`);
        const dung = (files || []).filter((f) => f.loai === (job.loai === 'video' ? 'video' : 'anh'));
        if (dung.length) return { ok: true, files: dung, chu: kq.chu };
        // Khung có mà chưa lấy được file → thử lại vòng sau, nhưng không mãi.
        if (++lanLayHong >= 5) return { ok: false, loi: 'Muse đã trả kết quả nhưng không lấy được file (5 lần)', giuThread: true };
        continue;
      }

      if (kq.chu && !coChuLuc) coChuLuc = Date.now();
      const giay = coChuLuc ? (Date.now() - coChuLuc) / 1000 : 0;
      if (hd.laTraLoiChu(kq, giay, ctx.choChuGiay)) {
        return { ok: false, loi: `Muse trả lời chữ, không có ${job.loai === 'video' ? 'video' : 'ảnh'}: "${kq.chu.slice(0, 200)}"` };
      }
    }
    return { ok: false, loi: `Quá ${ctx.choToiDaGiay} giây chưa thấy kết quả`, giuThread: true };
  }
}

module.exports = { Luong };
