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
      const ra = path.join(tam, 'ra');
      LENH.datCaiDat({ luongMoiTK: 3, nghiGiuaLanGui: 0, choChuGiay: 15, tuThuLai: 0, thuMucAnh: ra, thuMucVideo: ra });
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
    } catch (err) {
      ghi('LỖI KỊCH BẢN: ' + err.stack);
      loi.push('ngoại lệ');
    }
    ghi(loi.length ? `KẾT QUẢ: ${loi.length} lỗi` : 'KẾT QUẢ: tất cả đạt');
    app.exit(loi.length ? 1 : 0);
  });
};
