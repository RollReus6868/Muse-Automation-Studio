'use strict';
// ============================================================================
//  hang-doi.js — LOGIC THUẦN của hàng đợi: dự án, việc, tên file, câu lệnh.
//  Không đụng Electron, không đụng đĩa → node tests/run.js kiểm được hết.
//  Giao diện cũng nạp file này (window.HD) — một nguồn duy nhất cho cách tách
//  prompt, ước tiến độ, tìm nhân vật.
//
//  Một "việc" (job) = một prompt cần ra MỘT ảnh hoặc MỘT video:
//    { id, duAn, so, loai:'anh'|'video', prompt, tyLe, thamChieu:[đường dẫn],
//      nhanVat:[id], trangThai, buoc, thread, taiKhoan, files:[], loi,
//      thu, taoLuc, batDauLuc, xongLuc }
//  trangThai: 'cho' | 'chay' | 'xong' | 'loi'
//  `thread` còn giữ khi việc quay lại 'cho' (dừng giữa chừng, tắt app): lần
//  sau chỉ cần mở lại chat đó lấy kết quả, KHÔNG gửi lại prompt (đỡ tốn lượt).
// ============================================================================

const TY_LE = ['9:16', '16:9', '1:1', '4:3', '3:4'];

const MAU_MAC_DINH = {
  anh: 'Tạo 1 ảnh tỷ lệ {tyLe}: {prompt}\n{thamChieu}\nChỉ trả về ảnh, không hỏi lại, không giải thích.',
  video: 'Tạo 1 video tỷ lệ {tyLe}: {prompt}\n{thamChieu}\nChỉ trả về video, không hỏi lại, không giải thích.'
};

/** "Mặc định" → "Mac_dinh" — an toàn cho tên thư mục/tệp trên Windows lẫn Mac. */
function slugTen(ten) {
  const s = String(ten || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Du_an';
}

/**
 * Tách khối chữ thành danh sách prompt.
 * cach 'dong'   : mỗi dòng một prompt (bỏ dòng trống)
 * cach 'doan'   : các đoạn cách nhau bằng dòng trống (prompt nhiều dòng)
 */
function tachPrompt(chu, cach) {
  const s = String(chu || '').replace(/\r\n?/g, '\n');
  const ds = cach === 'doan' ? s.split(/\n\s*\n/) : s.split('\n');
  return ds.map((x) => x.trim()).filter(Boolean);
}

/** Tìm nhân vật được nhắc tên trong prompt (không phân biệt hoa thường, đúng nguyên từ). */
function timNhanVat(prompt, dsNhanVat) {
  const p = ' ' + String(prompt || '').toLowerCase() + ' ';
  return (dsNhanVat || []).filter((nv) => {
    const ten = String(nv.ten || '').trim().toLowerCase();
    if (!ten) return false;
    const i = p.indexOf(ten);
    if (i < 0) return false;
    const truoc = p.charAt(i - 1), sau = p.charAt(i + ten.length);
    const laChu = (c) => /[\p{L}\p{N}_]/u.test(c);
    return !laChu(truoc) && !laChu(sau);
  });
}

/**
 * Câu lệnh gửi Muse cho một việc.
 * @param job      việc
 * @param nhanVat  [{ten, moTa, anh:[...]}] đã chọn cho việc này (theo thứ tự đính kèm)
 * @param mau      {anh, video} mẫu câu lệnh người dùng sửa được
 */
function taoTinNhan(job, nhanVat, mau) {
  const m = (mau && mau[job.loai]) || MAU_MAC_DINH[job.loai];
  const dong = [];
  let stt = 1;
  for (const nv of nhanVat || []) {
    const n = (nv.anh || []).length;
    if (!n) continue;
    const vt = n === 1 ? `ảnh ${stt}` : `ảnh ${stt}–${stt + n - 1}`;
    dong.push(`Nhân vật "${nv.ten}" là ${vt} đính kèm${nv.moTa ? ` (${nv.moTa})` : ''}: giữ nguyên khuôn mặt và đặc điểm.`);
    stt += n;
  }
  const soThamChieu = (job.thamChieu || []).length;
  if (soThamChieu) {
    const vt = soThamChieu === 1 ? `ảnh ${stt}` : `ảnh ${stt}–${stt + soThamChieu - 1}`;
    dong.push(job.loai === 'video'
      ? `Dùng ${vt} đính kèm làm khung hình đầu / tham chiếu cho video.`
      : `Dùng ${vt} đính kèm làm ảnh tham chiếu.`);
  }
  return m
    .replace(/\{tyLe\}/g, job.tyLe || '9:16')
    .replace(/\{prompt\}/g, String(job.prompt || '').trim())
    .replace(/\{thamChieu\}/g, dong.join('\n'))
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Mac_dinh/Mac_dinh_083.png — số thứ tự 3 chữ số, thêm _2, _3 nếu Muse trả nhiều file. */
function tenFile(duAn, job, mime, thuTu) {
  const slug = slugTen(duAn && duAn.ten);
  const so = String(job.so).padStart(3, '0');
  const duoi = /mp4/.test(mime) ? 'mp4' : /webm/.test(mime) ? 'webm' : /png/.test(mime) ? 'png'
    : /jpe?g/.test(mime) ? 'jpg' : /webp/.test(mime) ? 'webp' : (/video/.test(mime) ? 'mp4' : 'png');
  return `${slug}/${slug}_${so}${thuTu > 0 ? '_' + (thuTu + 1) : ''}.${duoi}`;
}

/**
 * Việc kế tiếp nên chạy: cũ nhất trước.
 * uuTien(job) → true: lấy ngay (việc có chat dở của chính tài khoản này).
 * boQua(job)  → true: luồng này không được nhận (chat dở của tài khoản khác đang chạy).
 */
function viecKeTiep(jobs, uuTien, boQua) {
  let tot = null;
  for (const j of jobs) {
    if (j.trangThai !== 'cho') continue;
    if (boQua && boQua(j)) continue;
    if (uuTien && uuTien(j)) return j;
    if (!tot || j.taoLuc < tot.taoLuc || (j.taoLuc === tot.taoLuc && j.id < tot.id)) tot = j;
  }
  return tot;
}

/** Thời gian dự kiến (giây) = trung bình 10 việc xong gần nhất cùng loại, mặc định ảnh 35s, video 80s. */
function thoiGianDuKien(jobs, loai) {
  const xong = jobs.filter((j) => j.loai === loai && j.trangThai === 'xong' && j.batDauLuc && j.xongLuc)
    .sort((a, b) => b.xongLuc - a.xongLuc).slice(0, 10);
  if (!xong.length) return loai === 'video' ? 80 : 35;
  const tb = xong.reduce((s, j) => s + (j.xongLuc - j.batDauLuc), 0) / xong.length / 1000;
  return Math.max(10, Math.round(tb));
}

/** Tiến độ ước lượng 0–99 khi đang chạy (100 chỉ khi xong thật). */
function tienDoUoc(job, bayGio, duKienGiay) {
  if (job.trangThai === 'xong') return 100;
  if (job.trangThai !== 'chay' || !job.batDauLuc) return 0;
  const t = (bayGio - job.batDauLuc) / 1000;
  // Tới 90% theo dự kiến, sau đó bò chậm dần tới 99%, không bao giờ giả "xong".
  const p = t <= duKienGiay ? (t / duKienGiay) * 90 : 90 + 9 * (1 - Math.exp(-(t - duKienGiay) / duKienGiay));
  return Math.max(1, Math.min(99, Math.round(p)));
}

/** Đã đủ chưa để coi là xong: ảnh cần ≥1 ảnh, video cần ≥1 video. */
function daXong(loai, kq) {
  return loai === 'video' ? kq.soVideo > 0 : kq.soAnh > 0;
}

/**
 * Muse trả CHỮ mà không có ảnh/video, không còn gõ, không còn khung nào đang
 * nạp, và đã đợi đủ lâu → coi như Muse hỏi lại / từ chối.
 */
function laTraLoiChu(kq, giayTuKhiCoChu, choToiDa) {
  return !!kq.chu && !kq.dangGo && !kq.soKhungAnh && !kq.soKhungVideo && giayTuKhiCoChu >= choToiDa;
}

/** Thứ tự tự nhiên: anh2 < anh10. */
function soSanhTuNhien(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const HD = {
  TY_LE, MAU_MAC_DINH, slugTen, tachPrompt, timNhanVat, taoTinNhan, tenFile,
  viecKeTiep, thoiGianDuKien, tienDoUoc, daXong, laTraLoiChu, soSanhTuNhien
};
// Dùng chung cho tiến trình chính (require) và giao diện (<script> → window.HD).
if (typeof module !== 'undefined' && module.exports) module.exports = HD;
else window.HD = HD;
