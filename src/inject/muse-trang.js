// ============================================================================
//  muse-trang.js — trình trợ giúp TIÊM VÀO TRANG muse.ai (main world)
//  --------------------------------------------------------------------------
//  Mọi chỗ dò trang Muse nằm ở ĐÂY, không rải sang file khác. Muse đổi giao
//  diện thì chỉ sửa một file này (và trang giả tests/fixture-muse.html).
//
//  Dò bằng thuộc tính ỔN ĐỊNH Muse tự gắn (đo ngày 10/10/2026):
//    ô nhập          textarea[data-hatch-composer-prehydration-input]  (aria-label "Message")
//    nút gửi         button aria-label "Send" — hoặc nút MỚI hiện ở khung soạn sau khi gõ chữ
//    đính kèm        input[type=file]  (multiple)  → nút "Remove attachment" / ảnh thu nhỏ
//    tin của Muse    [data-message-role="assistant"]
//    khung ảnh       [data-testid="hatch-chat-attachment-presentation-image"]
//    khung video     [data-testid="hatch-chat-attachment-presentation-video"]
//    ảnh đang nạp    [data-testid="chat-image-not-found"]  (thoáng qua, KHÔNG phải lỗi)
//    đang gõ         [aria-label="Assistant is typing"]  hoặc aria-busy
//  NHÃN aria-label ĐỔI THEO NGÔN NGỮ (máy tiếng Việt: "Nhắn tin", "Gửi"…) → mọi chỗ dò theo
//  nhãn đều có bản tiếng Việt (NHAN) và một đường dự phòng không cần chữ.
//    mức token       nút dock [data-testid="hatch-dock-more"] → mục cuối menu → [role=dialog] [role=progressbar]
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

  // Nhãn Muse theo cả tiếng Anh lẫn tiếng Việt (giao diện Muse theo ngôn ngữ máy/tài khoản).
  const NHAN = {
    gui: /^(send|gửi)( message| tin nhắn)?$/i,
    goDinhKem: /remove|xóa|xoá|gỡ|bỏ/i,
    dangGo: /typing|đang (nhập|gõ|soạn|viết|trả lời)/i,
    mo: /^(open|mở|xem)/i,
    dong: /^(close|đóng)/i
  };
  const nhan = (e) => String((e && e.getAttribute('aria-label')) || '').trim();
  const nutTheoNhan = (re, goc) => $$('button[aria-label]', goc).filter((b) => re.test(nhan(b)));

  const oNhap = () => $('textarea[data-hatch-composer-prehydration-input]') ||
    $('textarea[aria-label="Message"],textarea[aria-label="Nhắn tin"]') || $('textarea');
  /** Khung soạn tin: tổ tiên gần nhất của ô nhập có chứa nút (nút gửi, đính kèm). */
  function khungSoan(ta) {
    let e = ta;
    for (let i = 0; e && i < 6; i++) {
      e = e.parentElement;
      if (e && (e.tagName === 'FORM' || $('input[type="file"]', e))) return e;
    }
    return (ta && ta.closest('form')) || (ta && ta.parentElement && ta.parentElement.parentElement) || document.body;
  }
  const tinMuse = () => $$('[data-message-role="assistant"]');

  function canDangNhap() {
    if (oNhap()) return false;
    const chu = (document.body && document.body.innerText) || '';
    if (/log in or create an account|đăng nhập hoặc tạo tài khoản/i.test(chu)) return true;
    // Ngôn ngữ khác: không có ô soạn tin mà có ô nhập email / số điện thoại = màn đăng nhập.
    return !!$('input[type="email"],input[type="tel"],input[autocomplete="username"]') ||
      $$('input').some((i) => /mail|phone|mobile|điện thoại/i.test(i.placeholder || ''));
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
      const k = khungSoan(ta);
      const soAnhTruoc = $$('img', k).length;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      // Đính kèm xong = có đủ nút gỡ tệp, hoặc (nhãn lạ) khung soạn có thêm đủ ảnh thu nhỏ.
      const du = await cho(() => nutTheoNhan(NHAN.goDinhKem, k).length >= files.length ||
        $$('img', k).length >= soAnhTruoc + files.length, 20000);
      if (!du) return { ok: false, loi: 'khong-dinh-kem-duoc', chu: chuLoiTrenTrang() };
      await ngu(800);
    }

    // Nút có sẵn trước khi gõ: nút Gửi là nút MỚI hiện ra sau khi có chữ (khi không đọc được nhãn).
    const nutCu = new Set($$('button', khungSoan(ta)));
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
    const nutGui = () => {
      const k = khungSoan(ta);
      const theoNhan = nutTheoNhan(NHAN.gui, k).concat(nutTheoNhan(NHAN.gui));
      if (theoNhan.length) return theoNhan[0];
      return $$('button', k).filter((b) => !nutCu.has(b)).pop() || $('button[type="submit"]', k);
    };
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
  /** Nút mở trình xem ảnh của một khung ảnh ("Open generated image…" / "Mở…"). */
  function nutMoAnh(khung) {
    const tin = khung.closest('[data-message-role="assistant"]') || khung;
    return nutTheoNhan(NHAN.mo, tin)[0] || null;
  }
  /** Ảnh coi như sẵn sàng: đã nạp, HOẶC chưa nạp (ảnh lười ở trang chạy ngầm) nhưng
   *  Muse đã gắn nút mở ảnh và không còn ô "đang nạp". */
  function anhSanSang(khung) {
    if (anhDaNap(khung)) return true;
    if ($('[data-testid="chat-image-not-found"]', khung)) return false;
    return !!nutMoAnh(khung);
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
      dangGo: $$('[aria-label]').some((e) => NHAN.dangGo.test(nhan(e))) ||
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
    const nut = nutMoAnh(khung) || $('button', khung);
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
    const nut = d && nutTheoNhan(NHAN.dong, d)[0];
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

  /** Bấm như người: menu Radix mở bằng pointerdown, sheet/nút thường bằng click → bắn cả hai. */
  function bam(e) {
    const o = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true };
    e.dispatchEvent(new PointerEvent('pointerdown', o)); e.dispatchEvent(new MouseEvent('mousedown', o));
    e.dispatchEvent(new PointerEvent('pointerup', o)); e.dispatchEvent(new MouseEvent('mouseup', o));
    e.click();
  }
  const thanhHanMuc = () => { const t = $$('[role="dialog"] [role="progressbar"]'); return t.length ? t : null; };

  /**
   * Mức dùng token: Cài đặt → Chung → "Usage" (đo 11/10/2026). Mỗi gói một [role=progressbar]
   * (aria-valuenow = % đã dùng); khối cha có 3 dòng: tên gói, ghi chú (ngày đặt lại…), "56% used (3B tokens left)".
   * Mở Cài đặt bằng nút dock [data-testid=hatch-dock-more] → mục CUỐI của menu (không đọc chữ, chạy cả tiếng Việt).
   * Gọi trong cửa sổ riêng (kiểm tài khoản) — không đóng lại, cửa sổ bị huỷ ngay sau đó.
   */
  async function hanMuc() {
    await cho(() => daNap(oNhap()), 20000);
    const nut = await cho(() => $('[data-testid="hatch-dock-more"]') || $('[data-pel-click="settings_menu_open_click"]'), 10000);
    if (!nut) return { ok: false, loi: 'khong-thay-nut-cai-dat' };
    bam(nut);
    const menu = await cho(() => $$('[role="menu"],[role="dialog"]').pop(), 5000);
    if (!menu) return { ok: false, loi: 'khong-mo-duoc-menu' };
    if (!thanhHanMuc()) {
      const muc = $$('[role="menuitem"],button', menu).filter((b) => String(b.innerText || '').trim());
      if (muc.length) bam(muc.pop());
    }
    // Cửa sổ rộng: Cài đặt mở thẳng mục Chung. Cửa sổ hẹp: phải bấm mục đầu (Chung).
    let thanh = await cho(thanhHanMuc, 6000);
    if (!thanh) {
      const o = $$('[role="dialog"]').pop();
      const c = o && $('[data-slot="list-cell"]', o);
      if (c) { bam(c); thanh = await cho(thanhHanMuc, 6000); }
    }
    if (!thanh) return { ok: false, loi: 'khong-thay-han-muc' };
    return {
      ok: true,
      muc: thanh.map((b) => {
        const dong = String(b.parentElement.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
        return { ten: dong[0] || '', ghiChu: dong.length > 2 ? dong[1] : '', chu: dong.length > 1 ? dong[dong.length - 1] : '',
          phanTram: Math.max(0, Math.min(100, Number(b.getAttribute('aria-valuenow')) || 0)) };
      })
    };
  }

  window.__muse = { phienBan: 1, trangThai, gui, ketQua, layFile, hanMuc };
})();
undefined;
