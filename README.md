# Muse Automation Studio

App desktop (Windows / macOS) tự động tạo **ảnh và video hàng loạt trên muse.ai**: dán nhiều prompt, chạy nhiều luồng song song trên nhiều tài khoản, tự tải kết quả về thư mục. Cách làm việc giống Flow Automation Studio, giao diện theo kiểu Meosu.

## Dùng nhanh

1. **Chạy app**
   - Bản cài: tải `MuseAutomationStudio-<phiên bản>-setup.exe` ở trang *Releases* của repo. Windows báo SmartScreen thì bấm *More info → Run anyway* (app chưa ký số).
   - Từ mã nguồn: bấm đúp `CHAY_TU_NGUON.bat`. Lần đầu nó cài Node.js và thư viện, mất 3–10 phút.
2. **Tài khoản** → *Đăng nhập* → đăng nhập muse.ai trong khung bên phải → *Xong, đóng lại*. Muốn chạy nhiều tài khoản thì *Thêm tài khoản* rồi đăng nhập từng tài khoản.
3. **Tạo ảnh / Tạo video** → dán prompt (mỗi dòng một prompt) → chọn tỷ lệ → **Tạo & chạy**.

Kết quả mặc định lưu ở `Tài liệu/Muse Automation Studio/<Dự_án>/<Dự_án>_001.png`; thư mục và tên file của ảnh, video đổi riêng được trong *Cài đặt nâng cao* của trang Tạo ảnh / Tạo video.

## Tính năng

| | |
|---|---|
| Nhiều luồng | Mỗi tài khoản N luồng (mặc định 3, tối đa 20 — chỉnh ở Cài đặt nâng cao trong cột Tạo), các tài khoản đang bật chạy cùng lúc |
| Nhiều tài khoản | Mỗi tài khoản một phiên đăng nhập riêng, không đá nhau ra |
| Chat sạch | Mỗi prompt chạy trong một *chat phụ mới* của Muse, không dính ngữ cảnh hay ảnh của prompt trước |
| Ảnh tham chiếu | Kéo thả ảnh để gửi kèm mọi prompt; *chọn thư mục* để gán ảnh 1 → prompt 1, ảnh 2 → prompt 2… |
| Nhân vật | Lưu ảnh nhân vật kèm tên; prompt nhắc tên là tự gửi kèm ảnh (*Giữ nguyên nhân vật*), hoặc chế độ *Người mẫu* gắn vào mọi prompt |
| Ảnh → video | *⋮ → Tạo video từ ảnh này*; hoặc bật **Ảnh xong → tự tạo video** để cả mẻ ảnh tự sinh video (chung một prompt video) |
| Video từ thư mục ảnh | Trang Tạo video → *Tạo video từ thư mục ảnh*: mỗi ảnh một video, dùng chung prompt ở ô *Prompt dùng chung*; `{tenAnh}` đặt tên video theo ảnh |
| Tự chạy lại lỗi | Hết hàng chờ còn việc lỗi → tự chạy lại (mặc định 2 lượt) |
| Chạy một đoạn | *Cài đặt nâng cao → Chạy từ prompt số … đến số …* |
| Nhiều file .txt | *Nhập nhiều file .txt*: mỗi file thành một dự án mang tên file và tự vào hàng đợi |
| Tải về & tên file | Trong *Cài đặt nâng cao* của trang Tạo ảnh / Tạo video: thư mục riêng cho ảnh / video, công tắc tải về riêng, mẫu tên `{duAn}` `{so}` `{stt}` `{prompt}` `{ngay}` `{loai}`; trùng tên tự thêm (2), không ghi đè |
| Chỉnh sửa ảnh | *Chỉnh sửa* ở ảnh đã xong: gửi ảnh + yêu cầu sửa thành việc mới |
| Dừng không mất lượt | Dừng giữa chừng hay tắt app, lần chạy sau mở lại đúng chat cũ để lấy kết quả, **không gửi lại prompt** |
| Muse hỏi lại | Muse trả lời chữ thay vì ảnh thì dòng đó báo *Lỗi* kèm câu Muse nói; sửa prompt rồi *Tạo lại* |
| Dự án | Mỗi dự án một hàng đợi + một thư mục kết quả |
| Mẫu prompt | Lưu / chèn nhanh các prompt hay dùng |
| Tự cập nhật | App tự hỏi GitHub Releases mỗi 4 giờ, tải và cài bản mới |

## Khi có sự cố

- **Nhật ký**: bấm nút *Nhật ký* ở góc dưới trái (số đỏ = số lỗi mới) để xem; bản đầy đủ nằm ở thư mục dữ liệu (*Cài đặt → Mở thư mục dữ liệu*, file `nhat-ky.txt`).
- **Muốn nhìn tận mắt luồng đang làm gì**: *Cài đặt → Hiện các luồng chạy ngầm*.
- **Muse đổi giao diện** làm tool không tìm thấy ô nhập / ảnh: mọi chỗ dò trang nằm trong một file `src/inject/muse-trang.js`.

## Cho người phát triển

```
main.js                   cửa sổ, luồng chạy ngầm, đăng nhập, file, cập nhật, lệnh IPC (LENH)
src/inject/muse-trang.js  trình trợ giúp tiêm vào muse.ai — MỌI selector của Muse ở đây
src/main/hang-doi.js      logic thuần (dùng chung với giao diện): tách prompt, câu lệnh, tên file…
src/main/dieu-phoi.js     dự án, hàng đợi, chia việc cho luồng, thử lại, lưu file
src/main/luong.js         một luồng: mở chat mới → đính kèm → gửi → chờ → lấy file
src/main/tai-khoan.js     tài khoản = session partition riêng
src/main/cap-nhat.js      tự cập nhật từ GitHub Releases (dùng lại từ Flow Automation Studio)
src/ui/                   giao diện JS thuần (không cần build)
tests/                    run.js (logic + kiểm tĩnh), cap-nhat-test.js, e2e.js (app thật trên trang Muse giả)
```

Kiểm thử:

```bash
npm test                                         # logic + tự cập nhật
node tests/e2e.js                                # app thật chạy trên trang Muse giả (tests/fixture-muse.html)
MUSE_TEST=tests/smoke-chup.js npx electron .     # chụp mọi trang vào shots/
```

Biến môi trường cho kiểm thử: `MUSE_URL` (địa chỉ Muse giả), `MUSE_DATA_DIR`, `MUSE_TEST`, `MUSE_NO_UPDATE_CHECK`, `MUSE_SHOW_LANES`, `MUSE_UPDATE_API`.

Phát hành: tăng `version` trong `package.json`, ghi `GHI_CHU_BAN_MOI.md` (nhắc số phiên bản), push, rồi *Actions → Phat hanh ban moi → Run workflow*. Repo phải để **public** thì app mới tự cập nhật được.

## Lịch sử

### 1.3.1 (10/10/2026) — Mac báo "Chưa đăng nhập" dù đã đăng nhập
- Nguyên nhân: Muse hiện tiếng Việt theo ngôn ngữ máy (ô soạn tin "Nhắn tin"), mà tool dò ô nhập theo nhãn tiếng Anh `aria-label="Message"` → không thấy ô nhập, không thấy màn đăng nhập → "Chưa kiểm" / "không kiểm được (mạng?)" / "Không mở được trang Muse".
- Sửa: `muse-trang.js` dò theo thuộc tính không phụ thuộc ngôn ngữ (`data-hatch-composer-prehydration-input`), mọi nhãn còn lại có bản tiếng Việt (`NHAN`) và đường dự phòng không cần chữ (nút Gửi = nút mới hiện sau khi gõ; đính kèm xong = có thêm ảnh thu nhỏ; màn đăng nhập = có ô email/điện thoại). Session xin `Accept-Language: en-US`. Trang giả có chế độ tiếng Việt (cookie `muse_lang=vi`, nhãn lạ cố ý) + bài đầu-cuối §11; helper cũ chạy trên chế độ này ra đúng triệu chứng của người dùng.
- Ô "Prompt dùng chung" riêng cho Tạo video từ thư mục ảnh. Nút Nhật ký nổi bật, có số lỗi chưa xem.

### 1.3.0 (10/10/2026)
- Video nối từ ảnh được ưu tiên chạy ngay (`viecKeTiep`: video `tuAnh` trước ảnh còn chờ) → ảnh và video chạy xen kẽ song song.
- Tạo video từ thư mục ảnh có sẵn (0–1 prompt = dùng chung; mặc định "chuyển động tự nhiên" khi để trống); ký hiệu `{tenAnh}`. Chọn thư mục ở trang video bỏ ảnh tham chiếu lẻ (tránh mỗi video bị gửi kèm 2 ảnh — bắt được trong bài đầu-cuối).
- "Chọn hết" trong hàng đợi. Hết lượt → tự chạy lại việc lỗi (`tuChayLaiLoi`, mặc định 2; Tạo lại tay đếm lại từ 0).
- Đã kiểm prompt > 20.000 ký tự đi tới Muse đủ (ô soạn tin của Muse không có maxlength).

### 1.2.1 (10/10/2026) — không gửi được prompt trên muse.ai thật
- Triệu chứng: mọi việc đứng "Đang gửi prompt" rồi "Lỗi luồng: Cannot read properties of undefined (reading 'trim')".
- Nguyên nhân gốc: luồng chạy là `WebContentsView` đặt `setVisible(false)` → `document.visibilityState = 'hidden'`, `requestAnimationFrame` dừng → Muse không "nạp" ô soạn tin (ô nhập tạm `data-hatch-composer-prehydration-input` không bao giờ được React gắn), nút Send không xuất hiện. Đo trong Electron: view ẩn → hidden/rAF 1 khung; `BrowserWindow({show:false, backgroundThrottling:false})` → visible/rAF chạy, kể cả sau show/hide và khi cửa sổ chính thu nhỏ. Nay mỗi luồng là một cửa sổ ẩn riêng.
- Dòng lỗi khó hiểu: `chuLoiTrenTrang()` gọi `.innerText.trim()` trên `<svg role="status">` (vòng quay Loading của Muse) — SVG không có innerText.
- Vì sao trước không bắt được: lúc thử tay trên muse.ai thì khung trình duyệt đang hiện; trang Muse giả gắn nút Send ngay không cần trang hiện. Nay trang giả chỉ gắn ô soạn tin trong `requestAnimationFrame` và có sẵn `<svg role="status">` — bản cũ chạy trên nó là đỏ toàn bộ (đã thử), bản mới xanh; CI chạy bài này trên Windows và macOS thật.
- Trình trợ giúp chờ ô soạn tin được nạp (dấu `__react…`) TRƯỚC khi điền prompt; trang ẩn → báo lỗi ngay sau 30 giây thay vì chờ nút Send 60 giây.

### 1.2.0 (10/10/2026)
- Nhập nhiều file .txt → mỗi file một dự án (tên theo tên file) và tự chạy. Tải về & tên file chuyển vào Cài đặt nâng cao của từng trang Tạo ảnh / Tạo video. Bỏ ký tự BOM khi nhập file .txt của Notepad.

### 1.1.0 (10/10/2026)
- Ảnh xong → tự tạo video (chung prompt video, cùng `{stt}` với ảnh). Chạy từ prompt số … đến số …. Thư mục, công tắc tải về và mẫu tên file riêng cho ảnh/video. Nút nhập .txt dưới ô Prompt. Số luồng chỉnh ngay trong cột Tạo, tối đa 20.
- Sửa lỗi: ảnh tham chiếu dùng chung giữa trang Tạo ảnh và Tạo video — gắn ảnh ở trang video ("Tạo video từ ảnh này") làm mọi prompt ảnh sau đó bị gửi kèm ảnh đó. Lần trước không bắt được vì bài đầu-cuối chưa có bước quay lại trang ảnh sau khi gắn ảnh ở trang video; nay có (`ảnh gắn ở trang video KHÔNG dính sang prompt ảnh`).
- Nâng cấp từ 1.0.0: thư mục kết quả cũ thành thư mục của cả ảnh lẫn video.

### 1.0.0 (10/10/2026)
- Bản đầu tiên. Selector đo trên muse.ai thật ngày 10/10/2026: gửi prompt, đính kèm ảnh, 6 việc chạy song song, ảnh → video, lấy file gốc (ảnh webp → png, video mp4) đều đã thử tay trên trang thật. Đường chạy đầy đủ của app (nhiều luồng, dừng/chạy tiếp, nhân vật, Muse hỏi lại, ảnh nạp lười) được kiểm trên trang Muse giả `tests/fixture-muse.html`.
