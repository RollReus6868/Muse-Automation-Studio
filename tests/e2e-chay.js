'use strict';
// Kịch bản đầu-cuối, chạy BÊN TRONG app thật (MUSE_TEST). Xem tests/e2e.js.
const fs = require('fs');
const path = require('path');
const { session, net } = require('electron');

module.exports = function e2e({ win, app, LENH, dieuPhoi }) {
  const tam = process.env.MUSE_E2E_TAM;
  const nhatKyFile = path.join(tam, 'e2e-log.txt');
  const ghi = (s) => { fs.appendFileSync(nhatKyFile, s + '\n'); console.log(s); };
  const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
  const loi = [];
  const kiem = (dk, ten) => { ghi(`${dk ? '  ✔' : '  ✘'} ${ten}`); if (!dk) loi.push(ten); };
  const cho = async (dk, ms, ten) => {
    const het = Date.now() + ms;
    while (Date.now() < het) { if (dk()) return true; await ngu(250); }
    ghi(`  ⏱ quá giờ chờ: ${ten}`);
    return false;
  };
  const viec = () => dieuPhoi.viec;
  /** Chờ một biểu thức trong giao diện thành đúng (máy CI chậm: đừng kiểm ngay sau khi bấm). */
  const choJs = async (bieuThuc, ms, ten) => {
    const het = Date.now() + ms;
    while (Date.now() < het) {
      if (await win.webContents.executeJavaScript(bieuThuc, true).catch(() => false)) return true;
      await ngu(200);
    }
    ghi(`  ⏱ quá giờ chờ giao diện: ${ten}`);
    return false;
  };
  const daGui = async () => (await net.fetch(`${process.env.MUSE_URL}/__da-gui`)).json();
  const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQAy2wIDqvFBJQAAAABJRU5ErkJggg==', 'base64');
  const chup = async (ten) => {
    fs.mkdirSync(path.join(__dirname, '..', 'shots'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'shots', ten), (await win.webContents.capturePage()).toPNG());
  };

  win.webContents.once('did-finish-load', async () => {
    try {
      ghi('== E2E Muse Automation Studio ==');
      // Tài khoản 1 đã đăng nhập (cookie của trang giả), tài khoản 2 chưa.
      await session.fromPartition('persist:muse-tk-1').cookies.set({ url: process.env.MUSE_URL, name: 'muse_login', value: '1' });
      const tk2 = await LENH.themTaiKhoan({ ten: 'TK hai' });
      // TK hai thấy Muse tiếng Việt: màn đăng nhập không có câu tiếng Anh nào → phải nhận ra qua ô email.
      await session.fromPartition(tk2.partition).cookies.set({ url: process.env.MUSE_URL, name: 'muse_lang', value: 'vi' });
      const ra = path.join(tam, 'ra');
      LENH.datCaiDat({ luongMoiTK: 3, nghiGiuaLanGui: 0, choChuGiay: 15, tuThuLai: 0, tuChayLaiLoi: 0, thuMucAnh: ra, thuMucVideo: ra });
      const anhNV = path.join(tam, 'lan.png'), anhRef = path.join(tam, 'ref.png');
      fs.writeFileSync(anhNV, PNG1); fs.writeFileSync(anhRef, PNG1);
      LENH.luuNhanVat({ ten: 'Lan', moTa: 'tóc ngắn', anh: [anhNV] });

      // 1) Dừng giữa chừng rồi chạy lại: phải lấy kết quả từ chat cũ, KHÔNG gửi lại prompt.
      ghi('-- 1. Dừng giữa chừng / chạy tiếp');
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', prompts: ['CHAM con mèo chạy tiếp'], tyLe: '1:1', chay: true });
      const jCham = viec().find((j) => /CHAM/.test(j.prompt));
      await cho(() => jCham.thread, 30000, 'việc CHAM có thread');
      LENH.dung();
      await cho(() => jCham.trangThai === 'cho' && !dieuPhoi.coViecDangChay(), 15000, 'việc CHAM về hàng chờ');
      kiem(jCham.trangThai === 'cho' && !!jCham.thread, 'dừng → việc về hàng chờ và GIỮ thread');

      // 2) Mẻ lớn: nhiều luồng, nhân vật, ảnh tham chiếu, video, các bẫy.
      ghi('-- 2. Mẻ chạy nhiều luồng');
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', tyLe: '16:9', tuNhanVat: true, chay: false,
        prompts: ['mèo cam số 1', 'mèo cam số 2', 'Lan đứng ở ban công', 'NOTFOUND ảnh nạp chậm', 'LUOI ảnh lười', 'HOI_LAI muse hỏi lại'] });
      LENH.them({ duAn: 'mac-dinh', loai: 'video', tyLe: '9:16', thamChieu: [anhRef], prompts: ['chó corgi chạy trên bãi biển'], chay: false });
      LENH.chay();
      await ngu(1500);
      await chup('e2e-dang-chay.png');
      if (!(await cho(() => !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 150000, 'chạy hết hàng chờ'))) {
        // Kẹt: in trang của từng luồng đang bận để biết nó dừng ở đâu.
        for (const x of dieuPhoi.luong) {
          if (x.luong.ranh) continue;
          const tt = await x.luong.wc.executeJavaScript(`({ url: location.href, chu: document.body.innerText.slice(0, 300),
            kq: window.__muse && window.__muse.ketQua() })`, true).catch((e) => ({ loi: e.message }));
          ghi(`   [kẹt] ${x.luong.id} việc #${x.luong.viec.so} buoc=${x.luong.viec.buoc}: ${JSON.stringify(tt)}`);
        }
      }

      const ds = viec();
      for (const j of ds) ghi(`   #${j.so} ${j.loai} ${j.trangThai} tk=${j.taiKhoan} files=${j.files.map((f) => path.relative(ra, f)).join(',')} ${j.loi || ''}`);
      const hoiLai = ds.find((j) => /HOI_LAI/.test(j.prompt));
      kiem(hoiLai && hoiLai.trangThai === 'loi' && /Muse trả lời chữ/.test(hoiLai.loi), 'Muse trả chữ → báo lỗi kèm câu Muse nói');
      const conLai = ds.filter((j) => j !== hoiLai);
      kiem(conLai.every((j) => j.trangThai === 'xong'), `mọi việc khác xong (${conLai.filter((j) => j.trangThai === 'xong').length}/${conLai.length})`);
      kiem(conLai.every((j) => j.files.length && fs.existsSync(j.files[0])), 'file kết quả có trên đĩa');
      const anh = conLai.filter((j) => j.loai === 'anh');
      kiem(anh.every((j) => /Mac_dinh[\\/]Mac_dinh_\d{3}\.png$/.test(j.files[0])), 'tên file Mac_dinh/Mac_dinh_NNN.png');
      kiem(anh.every((j) => fs.readFileSync(j.files[0]).slice(0, 4).toString('hex') === '89504e47'), 'ảnh đã đổi sang PNG thật');
      const ihdr = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
      const meo = anh.find((j) => /mèo cam số 1/.test(j.prompt));
      kiem(meo && ihdr(meo.files[0]).join('x') === '1024x576', `ảnh 16:9 đúng kích thước (${meo && ihdr(meo.files[0]).join('x')})`);
      const vid = conLai.find((j) => j.loai === 'video');
      kiem(vid && /\.mp4$/.test(vid.files[0]) && fs.statSync(vid.files[0]).size === 4096, 'video lưu .mp4 đủ byte');
      kiem(ds.every((j) => !j.taiKhoan || j.taiKhoan === 'tk-1'), 'không việc nào chạy bằng tài khoản chưa đăng nhập');
      const a2 = LENH.trangThai().taiKhoan.find((a) => a.id === tk2.id);
      kiem(a2 && a2.trangThai === 'can-dang-nhap', 'tài khoản chưa đăng nhập bị đánh dấu "Chưa đăng nhập"');
      // Chạy hết hàng chờ → tự đọc mức token (Cài đặt của Muse: menu mở bằng pointerdown).
      const hm1 = () => (LENH.trangThai().taiKhoan.find((a) => a.id === 'tk-1') || {}).hanMuc;
      await cho(() => hm1(), 30000, 'tự cập nhật mức token sau khi chạy xong');
      const h1 = hm1();
      kiem(h1 && h1.muc.length === 2 && h1.muc[0].ten === 'Free plan' && h1.muc[0].phanTram === 56 &&
        h1.muc[0].ghiChu === 'Weekly limit resets on Oct 16' && h1.muc[1].chu === '0% used (3B tokens left)',
        `chạy xong → tự đọc mức token tài khoản (${JSON.stringify(h1 && h1.muc)})`);

      const gui = await daGui();
      kiem(gui.length === ds.length, `số lần gửi = số việc (${gui.length}/${ds.length}) — không gửi lại`);
      kiem(gui.filter((g) => /CHAM/.test(g.prompt)).length === 1, 'việc dừng giữa chừng chỉ gửi 1 lần');
      const gLan = gui.find((g) => /Lan đứng/.test(g.prompt));
      kiem(gLan && gLan.soFile === 1 && /Nhân vật "Lan"/.test(gLan.prompt), 'prompt nhắc "Lan" → tự đính kèm ảnh nhân vật');
      const gVid = gui.find((g) => /corgi/.test(g.prompt));
      kiem(gVid && gVid.soFile === 1 && /^Tạo 1 video tỷ lệ 9:16/.test(gVid.prompt), 'video: đính kèm ảnh tham chiếu + câu lệnh video');
      const gMeo = gui.find((g) => /mèo cam số 1/.test(g.prompt));
      kiem(gMeo && gMeo.soFile === 0 && /^Tạo 1 ảnh tỷ lệ 16:9/.test(gMeo.prompt), 'ảnh thường: không đính kèm, đúng tỷ lệ');

      // Song song thật: ít nhất 2 việc chạy chồng thời gian.
      const kq = ds.filter((j) => j.batDauLuc && j.xongLuc);
      // Quét mốc thời gian: số việc đang chạy cùng một thời điểm.
      const moc = kq.flatMap((j) => [[j.batDauLuc, 1], [j.xongLuc, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let dang = 0, maxChong = 0;
      for (const [, d] of moc) { dang += d; maxChong = Math.max(maxChong, dang); }
      kiem(maxChong === 3, `chạy song song đúng 3 luồng (đo được ${maxChong} việc cùng lúc)`);

      // Giao diện hiển thị đúng.
      await win.webContents.executeJavaScript(`window.__diToi('anh')`, true);
      await ngu(800);
      const chu = await win.webContents.executeJavaScript(`document.querySelector('#dsHang').innerText`, true);
      kiem(/Hoàn tất/.test(chu) && /Lỗi/.test(chu), 'hàng đợi hiện "Hoàn tất" và "Lỗi"');
      await win.webContents.executeJavaScript(`document.querySelector('.dong-viec').click()`, true);
      await ngu(600);
      await chup('e2e-xong.png');

      // 3) Thao tác qua giao diện thật.
      ghi('-- 3. Bấm trên giao diện');
      const js = (x) => win.webContents.executeJavaScript(x, true);
      const truoc = viec().length;
      await js(`(() => { const o = document.querySelector('#oPrompt'); o.value = 'UI thử 1\\nUI thử 2'; o.dispatchEvent(new Event('input')); })()`);
      await js(`document.querySelector('#nutTaoMenu').click()`);
      await ngu(200);
      await js(`document.querySelector('#nutChiThem').click()`);
      await cho(() => viec().length === truoc + 2, 5000, 'thêm 2 việc từ giao diện');
      const moi = viec().slice(truoc);
      kiem(moi.length === 2 && moi.every((j) => j.trangThai === 'cho' && j.loai === 'anh') && moi[1].prompt === 'UI thử 2', 'ô Prompt → "Chỉ thêm vào hàng đợi" tạo đúng 2 việc chờ');
      LENH.xoaViec({ ids: moi.map((j) => j.id) });

      // Tạo video từ ảnh đã xong: chuyển sang trang video, gắn ảnh làm khung đầu.
      const xong = viec().find((j) => j.loai === 'anh' && j.trangThai === 'xong');
      await js(`(() => { const d = document.querySelector('.dong-viec[data-id="${xong.id}"]'); d.querySelector('[data-menu]').click(); })()`);
      await ngu(200);
      await js(`document.querySelector('.menu-dong [data-l="video"]').click()`);
      await ngu(500);
      const tt = await js(`({ tieuDe: document.querySelector('#tieuDeTao').textContent, anh: document.querySelectorAll('#dsThamChieu .anh-nho').length })`);
      kiem(tt.tieuDe === 'Tạo video' && tt.anh === 1, '"Tạo video từ ảnh này" → trang video, ảnh gắn sẵn làm khung đầu');
      await chup('e2e-video-tu-anh.png');

      // Đăng nhập: khung trình duyệt hiện đúng chỗ, đóng lại thì kiểm trạng thái.
      await js(`window.__diToi('taikhoan')`);
      await ngu(300);
      await js(`document.querySelector('[data-tk="dangNhap"][data-id="${tk2.id}"]').click()`);
      await cho(() => LENH.trangThai().dangNhap, 5000, 'mở khung đăng nhập');
      await ngu(2000);
      await chup('e2e-dang-nhap.png');
      kiem(LENH.trangThai().dangNhap && LENH.trangThai().dangNhap.id === tk2.id, 'bấm Đăng nhập → mở trang Muse của đúng tài khoản');
      const k = LENH.trangThai().dangNhap.khung;
      const o = await js(`(() => { const r = document.querySelector('#oTrinhDuyet').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
      kiem(['x', 'y', 'width', 'height'].every((t) => Math.abs(k[t] - o[t]) <= 2), `trình duyệt đăng nhập nằm đúng khung (${JSON.stringify(k)})`);
      await js(`document.querySelector('#nutXongDangNhap').click()`);
      await cho(() => !LENH.trangThai().dangNhap, 8000, 'đóng khung đăng nhập');
      kiem(!LENH.trangThai().dangNhap, 'bấm "Xong, đóng lại" → đóng khung đăng nhập');

      // 4) 1.1.0: chạy prompt 2–3, ảnh xong tự tạo video chung prompt, tên file + thư mục video riêng.
      ghi('-- 4. Khoảng prompt + ảnh→video tự động + tên file');
      const rv = path.join(tam, 'video-rieng');
      LENH.datCaiDat({ thuMucVideo: rv, tenAnh: '{duAn}/anh_{stt}', tenVideo: 'clip_{stt}' });
      const soGuiTruoc = (await daGui()).length;
      const truoc4 = viec().length;
      await js(`window.__diToi('anh')`);
      await ngu(300);
      await js(`(() => {
        const o = document.querySelector('#oPrompt'); o.value = 'cảnh một\\ncảnh hai\\ncảnh ba\\ncảnh bốn'; o.dispatchEvent(new Event('input'));
        document.querySelector('#nangCao').open = true;
        const t = document.querySelector('#tuSo'); t.value = '2'; t.dispatchEvent(new Event('input'));
        const d = document.querySelector('#denSo'); d.value = '3'; d.dispatchEvent(new Event('input'));
        const c = document.querySelector('#batChuoi'); c.checked = true; c.dispatchEvent(new Event('change'));
        const v = document.querySelector('#promptVideoChung'); v.value = 'máy quay đẩy chậm'; v.dispatchEvent(new Event('input'));
      })()`);
      await ngu(300);
      await choJs(`/prompt 2–3/.test(document.querySelector('#ghiKhoang').textContent)`, 5000, 'dòng báo khoảng prompt');
      const ghiKhoang = await js(`document.querySelector('#ghiKhoang').textContent`);
      kiem(/prompt 2–3 \(2\/4\)/.test(ghiKhoang), `giao diện báo khoảng sẽ chạy ("${ghiKhoang}")`);
      await chup('e2e-chuoi-video.png');
      await js(`document.querySelector('#nutTaoChay').click()`);
      await cho(() => viec().length >= truoc4 + 4 && !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 90000, 'chạy xong ảnh + video nối tiếp');
      const m4 = viec().slice(truoc4);
      const anh4 = m4.filter((j) => j.loai === 'anh'), vid4 = m4.filter((j) => j.loai === 'video');
      for (const j of m4) ghi(`   #${j.so} ${j.loai} stt=${j.stt} ${j.trangThai} ${j.files.join(',')}`);
      kiem(anh4.map((j) => j.prompt).join('|') === 'cảnh hai|cảnh ba', 'chỉ chạy prompt 2–3');
      kiem(vid4.length === 2 && vid4.every((v) => v.trangThai === 'xong' && v.prompt === 'máy quay đẩy chậm'), 'mỗi ảnh xong sinh đúng 1 video, chung prompt');
      kiem(anh4.every((j) => /Mac_dinh[\\/]anh_00[23]\.png$/.test(j.files[0]) && j.files[0].startsWith(ra)), 'tên ảnh theo mẫu {duAn}/anh_{stt}');
      kiem(vid4.map((v) => path.relative(rv, v.files[0])).sort().join(',') === 'clip_002.mp4,clip_003.mp4', 'video vào thư mục riêng, tên clip_{stt} khớp số ảnh');
      const gui4 = (await daGui()).slice(soGuiTruoc);
      kiem(gui4.filter((g) => /máy quay đẩy chậm/.test(g.prompt)).every((g) => g.soFile === 1 && /khung hình đầu/.test(g.prompt)), 'video gửi kèm đúng 1 ảnh làm khung đầu');
      kiem(gui4.filter((g) => /cảnh (hai|ba)/.test(g.prompt)).every((g) => g.soFile === 0), 'ảnh gắn ở trang video KHÔNG dính sang prompt ảnh');

      // 5) 1.2.0: Tải về & tên file nằm trong Cài đặt nâng cao, theo trang; nhập nhiều file .txt.
      ghi('-- 5. Tải về trong Cài đặt nâng cao + Nhập nhiều file .txt');
      const tenO = () => js(`({ nhan: document.querySelector('#ncNhanTen').firstChild.textContent, ten: document.querySelector('#ncTen').value, vd: document.querySelector('#ncViDu').textContent })`);
      const oAnh = await tenO();
      await js(`window.__diToi('video')`);
      await choJs(`document.querySelector('#ncTen').value === 'clip_{stt}'`, 5000, 'ô tên file trang video');
      const oVid = await tenO();
      kiem(oAnh.ten === '{duAn}/anh_{stt}' && oVid.ten === 'clip_{stt}' && /video/.test(oVid.nhan) && /clip_005\.mp4/.test(oVid.vd),
        `ô tên file đổi theo trang (ảnh "${oAnh.ten}", video "${oVid.ten}", ${oVid.vd})`);
      await js(`(() => { const o = document.querySelector('#ncTen'); o.value = 'vid_{stt}'; o.dispatchEvent(new Event('input')); o.dispatchEvent(new Event('change')); })()`);
      await cho(() => dieuPhoi.caiDat.tenVideo === 'vid_{stt}', 5000, 'lưu tên video');
      kiem(dieuPhoi.caiDat.tenVideo === 'vid_{stt}' && dieuPhoi.caiDat.tenAnh === '{duAn}/anh_{stt}', 'sửa tên ở trang video chỉ đổi tên video');
      await js(`window.__diToi('anh')`); await ngu(300);
      // Tắt chuỗi video và khoảng prompt của bước 4.
      await js(`(() => { const c = document.querySelector('#batChuoi'); c.checked = false; c.dispatchEvent(new Event('change'));
        for (const id of ['#tuSo', '#denSo']) { const o = document.querySelector(id); o.value = ''; o.dispatchEvent(new Event('input')); } })()`);
      LENH.nhapNhieuFile = async () => [
        { ten: 'Tập 1', noiDung: 'tập một cảnh A\ntập một cảnh B' },
        { ten: 'Tập 2', noiDung: '\uFEFFtập hai cảnh A' },
        { ten: 'rỗng', noiDung: '  \n ' }
      ];
      const truoc5 = viec().length, duAnTruoc = dieuPhoi.duAn.length;
      await js(`document.querySelector('#nutNhapNhieu').click()`);
      await choJs(`!document.querySelector('#phu').hidden && /Tập 2/.test(document.querySelector('#hopNoiDung').innerText)`, 10000, 'hộp xác nhận nhập nhiều file');
      const hop = await js(`({ mo: !document.querySelector('#phu').hidden, chu: document.querySelector('#hopNoiDung').innerText })`);
      kiem(hop.mo && /Tập 1 — 2 prompt/.test(hop.chu) && /Tập 2 — 1 prompt/.test(hop.chu) && /Bỏ qua.*rỗng/.test(hop.chu), 'hộp xác nhận liệt kê từng file, bỏ qua file rỗng');
      await chup('e2e-nhap-nhieu.png');
      await js(`document.querySelector('#hopOk').click()`);
      await cho(() => viec().length >= truoc5 + 3 && !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 90000, 'chạy xong 2 dự án mới');
      const da = dieuPhoi.duAn.slice(duAnTruoc);
      kiem(da.map((d) => d.ten).join('|') === 'Tập 1|Tập 2', `tạo đúng 2 dự án theo tên file (${da.map((d) => d.ten).join(', ')})`);
      const m5 = viec().slice(truoc5);
      for (const j of m5) ghi(`   #${j.so} ${j.duAn} ${j.trangThai} ${j.files.map((f) => path.relative(ra, f)).join(',')}`);
      kiem(m5.length === 3 && m5.every((j) => j.trangThai === 'xong' && j.loai === 'anh'), 'mọi prompt của các file đều chạy xong');
      kiem(m5.filter((j) => j.duAn === da[0].id).length === 2 && m5.filter((j) => j.duAn === da[1].id).length === 1, 'mỗi file vào đúng dự án của nó');
      kiem(m5.map((j) => path.relative(ra, j.files[0]).replace(/\\/g, '/')).sort().join(',') === 'Tap_1/anh_001.png,Tap_1/anh_002.png,Tap_2/anh_001.png',
        'file lưu theo dự án, không trùng tên giữa các file .txt');
      kiem(!m5.some((j) => j.chuoi), 'tắt "tự tạo video" thì không nối video');
      await choJs(`/^Tập 1/.test(document.querySelector('#tenDuAn').textContent)`, 5000, 'ô dự án chuyển sang Tập 1');
      const ui5 = await js(`document.querySelector('#tenDuAn').textContent`);
      kiem(/^Tập 1/.test(ui5), `chuyển sang dự án đầu tiên vừa tạo ("${ui5}")`);

      // 6) 1.3.0: ảnh và video song song — 1 luồng, 3 ảnh nối video: video 1 phải chạy TRƯỚC ảnh 2.
      ghi('-- 6. Ảnh và video song song');
      LENH.datCaiDat({ luongMoiTK: 1 });
      const truoc6 = viec().length;
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', prompts: ['ss một', 'ss hai', 'ss ba'], chuoiVideo: { prompt: 'ss chuyển động' }, chay: true });
      await cho(() => viec().length >= truoc6 + 6 && !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 90000, 'chạy xong 3 ảnh + 3 video');
      const thuTu = viec().slice(truoc6).filter((j) => j.batDauLuc).sort((x, y) => x.batDauLuc - y.batDauLuc)
        .map((j) => (j.loai === 'video' ? 'V' : 'A') + j.stt);
      ghi(`   thứ tự chạy: ${thuTu.join(' → ')}`);
      kiem(thuTu.join(',') === 'A1,V1,A2,V2,A3,V3', 'ảnh xong là video của nó chạy ngay, không chờ hết mẻ ảnh');
      LENH.datCaiDat({ luongMoiTK: 3 });

      // 7) Hết lượt còn việc lỗi → tự chạy lại.
      ghi('-- 7. Tự chạy lại việc lỗi');
      LENH.datCaiDat({ tuChayLaiLoi: 1 });
      const gui7 = (await daGui()).length;
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', prompts: ['HOI_LAI lần hai'], chay: true });
      const j7 = viec()[viec().length - 1];
      await cho(() => !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 90000, 'chạy xong việc lỗi + lượt lại');
      const lan7 = (await daGui()).slice(gui7).filter((g) => /HOI_LAI lần hai/.test(g.prompt)).length;
      kiem(j7.trangThai === 'loi' && j7.vongLai === 1 && lan7 === 2, `việc lỗi được tự chạy lại đúng 1 lượt (gửi ${lan7} lần, vongLai=${j7.vongLai})`);
      LENH.datCaiDat({ tuChayLaiLoi: 0 });

      // 8) Tạo video từ thư mục ảnh có sẵn: để trống prompt → mỗi ảnh một video, tên video = tên ảnh.
      ghi('-- 8. Video từ thư mục ảnh');
      const thuMucAnh = path.join(tam, 'anh-co-san');
      fs.mkdirSync(thuMucAnh, { recursive: true });
      const tenAnh = ['canh 10.png', 'canh 2.png', 'canh 1.png'];
      for (const t of tenAnh) fs.writeFileSync(path.join(thuMucAnh, t), PNG1);
      LENH.chonThuMucAnh = async () => ({ thuMuc: thuMucAnh, anh: ['canh 1.png', 'canh 2.png', 'canh 10.png'].map((t) => path.join(thuMucAnh, t)) });
      LENH.datCaiDat({ tenVideo: 'tu-anh/{tenAnh}' });
      const gui8 = (await daGui()).length, truoc8 = viec().length;
      await js(`window.__diToi('video')`);
      await choJs(`!document.querySelector('#khuVideoThuMuc').hidden`, 5000, 'khối video từ thư mục');
      await js(`(() => { const o = document.querySelector('#oPrompt'); o.value = ''; o.dispatchEvent(new Event('input'));
        for (const id of ['#tuSo', '#denSo']) { const x = document.querySelector(id); x.value = ''; x.dispatchEvent(new Event('input')); }
        const c = document.querySelector('#promptThuMuc'); c.value = 'chung cho thư mục lắc lư'; c.dispatchEvent(new Event('input'));
        document.querySelector('#nutVideoThuMuc').click(); })()`);
      await choJs(`/3 ảnh/.test(document.querySelector('#ghiVideoThuMuc').textContent)`, 5000, 'báo 3 ảnh');
      await chup('e2e-video-thu-muc.png');
      await js(`document.querySelector('#nutTaoChay').click()`);
      await cho(() => viec().length >= truoc8 + 3 && !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 90000, 'chạy xong 3 video từ thư mục');
      const v8 = viec().slice(truoc8);
      const g8 = (await daGui()).slice(gui8);
      kiem(v8.length === 3 && v8.every((j) => j.loai === 'video' && j.trangThai === 'xong'), 'thư mục 3 ảnh → 3 video xong');
      kiem(g8.length === 3 && g8.every((g) => g.soFile === 1 && g.prompt.includes('chung cho thư mục lắc lư')), 'mỗi video gửi kèm đúng 1 ảnh, dùng prompt ở ô "dùng chung"');
      kiem(v8.map((j) => path.relative(rv, j.files[0]).replace(/\\/g, '/')).join(',') === 'tu-anh/canh 1.mp4,tu-anh/canh 2.mp4,tu-anh/canh 10.mp4',
        `tên video = tên ảnh, theo thứ tự tự nhiên (${v8.map((j) => path.basename(j.files[0] || '?')).join(', ')})`);

      // 9) Prompt rất dài không bị cắt.
      ghi('-- 9. Prompt 20.000 ký tự');
      const dai = ('Cảnh dài ' + 'chi tiết '.repeat(2300)).trim();
      const gui9 = (await daGui()).length;
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', prompts: [dai], chay: true });
      await cho(() => !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 60000, 'chạy xong prompt dài');
      const g9 = (await daGui()).slice(gui9)[0];
      kiem(g9 && g9.prompt.includes(dai) && dai.length > 20000, `prompt ${dai.length} ký tự tới Muse đủ, không bị cắt (${g9 ? g9.prompt.length : 0})`);

      // 10) Chọn tất cả trong hàng đợi.
      ghi('-- 10. Chọn tất cả');
      await js(`window.__diToi('anh')`);
      await choJs(`document.querySelectorAll('#dsHang .dong-viec').length > 0`, 5000, 'có dòng');
      await js(`(() => { const c = document.querySelector('#chonHet'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
      await choJs(`!document.querySelector('#thanhChon').hidden`, 5000, 'thanh chọn hiện');
      const c10 = await js(`({ dong: document.querySelectorAll('#dsHang .dong-viec').length, tich: document.querySelectorAll('#dsHang [data-chon]:checked').length, chu: document.querySelector('#soChon').textContent })`);
      kiem(c10.dong > 0 && c10.tich === c10.dong && c10.chu === `${c10.dong} đã chọn`, `"Tất cả" chọn mọi dòng đang hiện (${c10.chu})`);
      await js(`(() => { const c = document.querySelector('#chonHet'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
      await choJs(`document.querySelector('#thanhChon').hidden`, 5000, 'bỏ chọn hết');
      kiem(await js(`document.querySelectorAll('#dsHang [data-chon]:checked').length === 0`), 'bỏ "Tất cả" thì bỏ chọn hết');

      // 11) Muse giao diện tiếng Việt (máy Mac tiếng Việt): vẫn nhận đăng nhập, gửi, đính kèm, mở ảnh.
      ghi('-- 11. Muse tiếng Việt');
      const tk1 = session.fromPartition('persist:muse-tk-1');
      await LENH.capNhatToken();     // chờ lượt cập nhật token chạy ngầm (nếu có) xong, kẻo nó ghi đè kết quả dưới
      await tk1.cookies.set({ url: process.env.MUSE_URL, name: 'muse_lang', value: 'vi' });
      kiem(await LENH.kiemTaiKhoan({ id: 'tk-1' }) === 'da-dang-nhap', 'Muse tiếng Việt: "Kiểm tra" báo đã đăng nhập');
      const h11 = LENH.trangThai().taiKhoan.find((a) => a.id === 'tk-1').hanMuc;
      kiem(h11 && h11.muc[1] && h11.muc[1].chu === 'Đã dùng 0% (còn 3 tỷ token)' && h11.muc[0].phanTram === 56,
        'Muse tiếng Việt: vẫn đọc được mức token');
      await js(`window.__diToi('taikhoan')`);
      kiem(await choJs(`/còn 3 tỷ token/.test(document.querySelector('#dsTaiKhoan').innerText) && document.querySelector('.hm-thanh i').style.width === '56%'`, 5000, 'thẻ tài khoản hiện token'),
        'trang Tài khoản hiện mức token + thanh %');
      await chup('e2e-token.png');
      const gui11 = (await daGui()).length, truoc11 = viec().length;
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', tyLe: '1:1', thamChieu: [anhRef], prompts: ['vi có ảnh kèm', 'LUOI vi ảnh lười'], chay: true });
      await cho(() => !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 60000, 'chạy xong việc tiếng Việt');
      const v11 = viec().slice(truoc11), g11 = (await daGui()).slice(gui11);
      for (const j of v11) ghi(`   #${j.so} ${j.trangThai} ${j.loi || ''}`);
      kiem(v11.length === 2 && v11.every((j) => j.trangThai === 'xong' && j.files.length), 'Muse tiếng Việt: 2 việc xong, có file (kể cả ảnh lười)');
      kiem(g11.length === 2 && g11.every((g) => g.soFile === 1), 'Muse tiếng Việt: mỗi lần gửi kèm đúng 1 ảnh');
      await tk1.cookies.remove(process.env.MUSE_URL, 'muse_lang');

      // 12) Đặt lại hàng đợi: mọi việc ảnh của dự án đang xem về Chờ, xoá chat cũ.
      ghi('-- 12. Đặt lại hàng đợi');
      await js(`window.__diToi('anh')`);
      const duAn12 = await js(`JSON.parse(localStorage.getItem('muse-studio-ui')).duAn`);
      const cuaDuAn = () => viec().filter((j) => j.duAn === duAn12 && j.loai === 'anh');
      const truoc12 = cuaDuAn();
      const chuaCho12 = truoc12.filter((j) => j.trangThai !== 'cho').length;   // đọc NGAY: các đối tượng sẽ bị sửa tại chỗ
      const video12 = viec().filter((j) => j.loai === 'video').map((j) => j.trangThai).join();
      ghi(`   dự án ${duAn12}: ${truoc12.length} việc ảnh (${truoc12.filter((j) => j.trangThai === 'xong').length} xong)`);
      await js(`document.querySelector('#nutDatLai').click()`);
      await choJs(`!!document.querySelector('#hopOk') && document.querySelector('#hopOk').offsetParent !== null`, 5000, 'hộp xác nhận đặt lại');
      await js(`document.querySelector('#hopOk').click()`);
      await cho(() => cuaDuAn().every((j) => j.trangThai === 'cho'), 5000, 'mọi việc về Chờ');
      const sau12 = cuaDuAn();
      kiem(chuaCho12 > 0 && sau12.length === truoc12.length &&
        sau12.every((j) => j.trangThai === 'cho' && !j.thread && !j.loi && !j.vongLai), `"Đặt lại" đưa ${sau12.length} việc ảnh về Chờ, xoá chat/lỗi cũ`);
      kiem(viec().filter((j) => j.loai === 'video').map((j) => j.trangThai).join() === video12, 'hàng đợi video không bị đụng');

      // 13) Muse kẹt "Connecting..." (mất kết nối máy ảo — người dùng gặp 12/10/2026): KHÔNG gửi,
      //     không chờ suông 600 giây, tạm dừng cả hàng chờ, việc về Chờ.
      ghi('-- 13. Muse mất kết nối');
      await tk1.cookies.set({ url: process.env.MUSE_URL, name: 'muse_matketnoi', value: '1' });
      const gui13 = (await daGui()).length, t13 = Date.now();
      LENH.them({ duAn: 'mac-dinh', loai: 'anh', tyLe: '1:1', prompts: ['mất kết nối 1', 'mất kết nối 2'], chay: true });
      const v13 = viec().slice(-2);
      await cho(() => !dieuPhoi.dangChay && !dieuPhoi.coViecDangChay(), 40000, 'tạm dừng vì mất kết nối');
      kiem(!dieuPhoi.dangChay && Date.now() - t13 < 40000, `mất kết nối → tự tạm dừng sau ${Math.round((Date.now() - t13) / 1000)} s (không chờ 600 s)`);
      kiem(v13.every((j) => j.trangThai === 'cho' && !j.thu), 'việc về Chờ, không tính là lần thử');
      kiem((await daGui()).length === gui13, 'không gửi prompt nào khi Muse mất kết nối');
      kiem(LENH.trangThai().nhatKy.some((d) => /mất kết nối \("Connecting\.\.\."\).*TẠM DỪNG/.test(d.chu || d.text || JSON.stringify(d))), 'nhật ký nói rõ Muse mất kết nối, đã tạm dừng');
      await tk1.cookies.remove(process.env.MUSE_URL, 'muse_matketnoi');
      LENH.xoaViec({ ids: v13.map((j) => j.id) });

      // 14) Xoá chat trên Muse: theo việc đã chọn, rồi xoá toàn bộ.
      ghi('-- 14. Xoá chat Muse');
      const dsThread = async () => (await net.fetch(`${process.env.MUSE_URL}/__ds-thread`)).json();
      const jv = viec().find((j) => j.loai === 'video' && j.trangThai === 'xong' && j.thread);
      const id14 = jv && jv.thread.split('/').pop();
      const truoc14 = (await dsThread()).length;
      const r14 = jv ? await LENH.xoaChatViec({ ids: [jv.id] }) : null;
      const sau14 = await dsThread();
      kiem(r14 && r14.ok && r14.da === 1 && sau14.length === truoc14 - 1 && !sau14.some((t) => t.thread === id14) && !jv.thread,
        `xoá chat của 1 việc đã chọn (${truoc14} → ${sau14.length}), việc bỏ đường dẫn chat`);
      const r14b = await LENH.xoaChatTaiKhoan({ id: 'tk-1' });
      const con14 = await dsThread();
      kiem(r14b && r14b.ok && r14b.da === sau14.length && con14.length === 0, `xoá toàn bộ chat (${r14b && r14b.da} cái), không còn chat nào`);
    } catch (err) {
      ghi('LỖI KỊCH BẢN: ' + err.stack);
      loi.push('ngoại lệ');
    }
    ghi(loi.length ? `KẾT QUẢ: ${loi.length} lỗi` : 'KẾT QUẢ: tất cả đạt');
    app.exit(loi.length ? 1 : 0);
  });
};
