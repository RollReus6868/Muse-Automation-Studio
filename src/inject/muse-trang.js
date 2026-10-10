// ============================================================================
//  muse-trang.js — trình trợ giúp TIÊM VÀO TRANG muse.ai (main world)
//  --------------------------------------------------------------------------
//  Mọi chỗ dò trang Muse nằm ở ĐÂY, không rải sang file khác. Muse đổi giao
//  diện thì chỉ sửa một file này (và trang giả tests/fixture-muse.html).
//
//  Dò bằng thuộc tính ỔN ĐỊNH Muse tự gắn (đo ngày 10/10/2026):
//    ô nhập          textarea[aria-label="Message"]
//    nút gửi         button[aria-label="Send"]
//    đính kèm        input[type=file]  (multiple)  → nút "Remove attachment"
//    tin của Muse    [data-message-role="assistant"]
//    khung ảnh       [data-testid="hatch-chat-attachment-presentation-image"]
//    khung video     [data-testid="hatch-chat-attachment-presentation-video"]
//    ảnh đang nạp    [data-testid="chat-image-not-found"]  (thoáng qua, KHÔNG phải lỗi)
//    đang gõ         [aria-label="Assistant is typing"]
//  Ảnh/video nằm trong blob: cùng nguồn → fetch() lấy được file gốc, khỏi
//  bấm nút Download.
//
//  Mọi hàm trả dữ liệu thuần (structured-clone được). File kết thúc bằng
//  `undefined` để executeJavaScript không phải sao chép một hàm.
// ============================================================================
(function () {
  if (window.__muse && window.__muse.phienBan === 1) return;

  const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, goc) => (goc || document).querySelector(s);
  const $$ = (s, goc) => Array.from((goc || document).querySelectorAll(s));

  async function cho(dieuKien, ms, buoc) {
    const het = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = dieuKien(); } catch (_) {}
      if (v) return v;
      if (Date.now() > het) return null;
      await ngu(buoc || 250);
    }
  }

  const oNhap = () => $('textarea[aria-label="Message"]');
  const nutGui = () => $('button[aria-label="Send"]');
  const tinMuse = () => $$('[data-message-role="assistant"]');

  function canDangNhap() {
    if (oNhap()) return false;
    const chu = (document.body && document.body.innerText) || '';
    return /log in or create an account|đăng nhập hoặc tạo tài khoản/i.test(chu);
  }

  function trangThai() {
    return {
      url: location.href,
      coONhap: !!oNhap(),
      canDangNhap: canDangNhap(),
      soTinMuse: tinMuse().length
    };
  }

  function b64SangFile(f) {
    const bin = atob(f.b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], f.ten || 'anh.png', { type: f.mime || 'image/png' });
  }

  /** Chữ Muse đang báo lỗi trên trang (toast, alert) — để nhật ký nói được VÌ SAO. */
  function chuLoiTrenTrang() {
    // Muse có cả <svg role="status"> (vòng quay "Loading"): SVG KHÔNG có innerText/offsetParent →
    // phải lọc theo kiểu phần tử, nếu không .trim() trên undefined làm hỏng cả bước gửi/kiểm.
    return $$('[role="alert"],[role="status"],[data-sonner-toast]')
      .filter((e) => e instanceof HTMLElement && e.offsetParent !== null && !e.closest('[role="log"]'))
      .map((e) => String(e.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 300);
  }

  /**
   * Gửi một prompt (kèm ảnh nếu có) vào chat đang mở.
   * @param {{text:string, files:{ten,mime,b64}[]}} p
   */
  /** Ô soạn tin đã được React "nạp" chưa. Muse hiện sẵn một ô nhập tạm
   *  (data-hatch-composer-prehydration-input) trước khi nạp; điền chữ vào ô tạm thì nút Send
   *  không bao giờ xuất hiện. Trang bị ẩn (visibilityState hidden) thì Muse không nạp. */
  const daNap = (ta) => !!ta && Object.keys(ta).some((k) => k.startsWith('__react'));

  async function gui(p) {
    let ta = await cho(oNhap, 25000);
    if (!ta) return { ok: false, loi: canDangNhap() ? 'can-dang-nhap' : 'khong-thay-o-nhap' };
    ta = await cho(() => { const t = oNhap(); return daNap(t) ? t : null; }, 30000);
    if (!ta) {
      // Trang ẩn thì chắc chắn không nạp → báo ngay. Trang đang hiện mà không thấy dấu nạp
      // (Muse đổi cách làm) → vẫn thử đường cũ: điền rồi chờ nút Gửi.
      if (document.visibilityState === 'hidden') return { ok: false, loi: 'o-soan-tin-chua-nap', chu: 'trang đang bị ẩn' };
      ta = oNhap();
      if (!ta) return { ok: false, loi: 'khong-thay-o-nhap' };
    }

    const files = (p.files || []);
    if (files.length) {
      const inp = $('input[type="file"]');
      if (!inp) return { ok: false, loi: 'khong-thay-o-dinh-kem' };
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(b64SangFile(f));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      const du = await cho(() => $$('button[aria-label="Remove attachment"]').length >= files.length, 20000);
      if (!du) return { ok: false, loi: 'khong-dinh-kem-duoc', chu: chuLoiTrenTrang() };
      await ngu(800);
    }

    // React giữ giá trị riêng: phải gán qua setter gốc rồi bắn sự kiện input.
    const datGiaTri = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    datGiaTri.call(ta, p.text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await ngu(300);
    if (ta.value !== p.text) {
      ta.focus();
      ta.select();
      document.execCommand('insertText', false, p.text);
      await ngu(300);
    }
    if (ta.value !== p.text) return { ok: false, loi: 'khong-dan-duoc-prompt' };

    // Ảnh đang tải lên thì nút gửi tắt — chờ, đừng bấm vào nút chết.
    const nut = await cho(() => { const b = nutGui(); return b && !b.disabled ? b : null; }, 60000);
    if (!nut) return { ok: false, loi: 'nut-gui-bi-tat', chu: chuLoiTrenTrang() };

    const truoc = location.pathname;
    const soUserTruoc = $$('[data-message-role="user"]').length;
    nut.click();
    const an = await cho(() =>
      (location.pathname !== truoc && !/\/new$/.test(location.pathname)) ||
      $$('[data-message-role="user"]').length > soUserTruoc, 20000);
    if (!an) return { ok: false, loi: 'gui-khong-an', chu: chuLoiTrenTrang() };
    // Chờ thêm chút để chắc đường dẫn chat mới đã có.
    await cho(() => !/\/new$/.test(location.pathname), 5000);
    return { ok: true, thread: location.href };
  }

  function anhDaNap(khung) {
    return $$('img', khung).find((i) => /^blob:|^data:|^https?:/.test(i.src) && i.complete && i.naturalWidth > 16) || null;
  }
  /** Ảnh coi như sẵn sàng: đã nạp, HOẶC chưa nạp (ảnh lười ở trang chạy ngầm) nhưng
   *  Muse đã gắn nút "Open generated image" và không còn ô "đang nạp". */
  function anhSanSang(khung) {
    if (anhDaNap(khung)) return true;
    if ($('[data-testid="chat-image-not-found"]', khung)) return false;
    const tin = khung.closest('[data-message-role="assistant"]') || khung;
    return !!$('button[aria-label^="Open generated image"]', tin);
  }
  function videoCoNguon(khung) {
    return $$('video', khung).find((v) => /^blob:|^https?:/.test(v.currentSrc || v.src)) || null;
  }

  /** Tình hình chat hiện tại: Muse đã trả ảnh/video chưa, hay đang gõ, hay trả chữ. */
  function ketQua() {
    const ms = tinMuse();
    const khungAnh = $$('[data-testid="hatch-chat-attachment-presentation-image"]');
    const khungVideo = $$('[data-testid="hatch-chat-attachment-presentation-video"]');
    return {
      url: location.href,
      soTinMuse: ms.length,
      soKhungAnh: khungAnh.length,
      soKhungVideo: khungVideo.length,
      soAnh: khungAnh.filter(anhSanSang).length,
      soVideo: khungVideo.filter(videoCoNguon).length,
      dangNap: $$('[data-testid="chat-image-not-found"]').length,
      dangGo: !!$('[aria-label="Assistant is typing"]') ||
        ms.some((m) => m.querySelector('[aria-busy="true"]')),
      chu: ms.map((m) => (m.innerText || '').trim()).filter(Boolean).join('\n').slice(0, 600),
      canDangNhap: canDangNhap(),
      loiTrang: chuLoiTrenTrang()
    };
  }

  function blobSangB64(b) {
    return new Promise((r, j) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result).split(',')[1] || '');
      fr.onerror = () => j(fr.error);
      fr.readAsDataURL(b);
    });
  }

  async function anhSangPng(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return await new Promise((r) => c.toBlob(r, 'image/png'));
  }

  /** Ảnh trong khung chưa nạp (ảnh lười) → mở trình xem của Muse để lấy. */
  async function moTrinhXem(khung) {
    const tin = khung.closest('[data-message-role="assistant"]') || document;
    const nut = $('button[aria-label^="Open generated image"]', tin) || $('button[aria-label^="Open"]', khung);
    if (!nut) return { daMo: false, img: null };
    nut.click();
    const img = await cho(() => {
      const d = $$('[role="dialog"]').pop();
      return d ? anhDaNap(d) : null;
    }, 15000);
    return { daMo: true, img };
  }
  function dongTrinhXem() {
    const d = $$('[role="dialog"]').pop();
    const nut = d && $('button[aria-label="Close"]', d);
    if (nut) nut.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  /**
   * Lấy file gốc của mọi ảnh/video Muse trả trong chat này.
   * @param {{png:boolean}} p  png=true: đổi ảnh webp sang png
   */
  async function layFile(p) {
    const ra = [];
    for (const khung of $$('[data-testid="hatch-chat-attachment-presentation-image"]')) {
      let img = anhDaNap(khung);
      let moXem = false;
      try {
        // Đã mở trình xem thì LUÔN đóng lại, kể cả khi không lấy được ảnh —
        // nếu không, mỗi vòng lại mở thêm một trình xem chồng lên.
        if (!img) { const x = await moTrinhXem(khung); moXem = x.daMo; img = x.img; }
        if (!img) continue;
        let b = await (await fetch(img.src)).blob();
        if (p && p.png && b.type !== 'image/png') b = (await anhSangPng(img)) || b;
        ra.push({ loai: 'anh', mime: b.type || 'image/png', w: img.naturalWidth, h: img.naturalHeight, b64: await blobSangB64(b) });
      } finally {
        if (moXem) { dongTrinhXem(); await ngu(400); }
      }
    }
    for (const khung of $$('[data-testid="hatch-chat-attachment-presentation-video"]')) {
      const v = videoCoNguon(khung);
      if (!v) continue;
      const b = await (await fetch(v.currentSrc || v.src)).blob();
      ra.push({ loai: 'video', mime: b.type || 'video/mp4', w: v.videoWidth || 0, h: v.videoHeight || 0, b64: await blobSangB64(b) });
    }
    return ra;
  }

  window.__muse = { phienBan: 1, trangThai, gui, ketQua, layFile };
})();
undefined;
