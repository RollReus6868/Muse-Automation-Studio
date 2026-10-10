# Muse Automation Studio 1.2.1 — sửa lỗi không gửi được prompt

- **Sửa lỗi "Lỗi luồng: Cannot read properties of undefined (reading 'trim')"** — mọi prompt đứng ở "Đang gửi prompt" rồi báo lỗi.
  - Nguyên nhân gốc: các luồng chạy trong trang ẩn; Muse không nạp ô soạn tin khi trang bị ẩn nên nút Gửi không bao giờ hiện. Nay mỗi luồng chạy trong một cửa sổ ẩn riêng, trang luôn ở trạng thái "đang hiện".
  - Dòng lỗi khó hiểu là do tool đọc chữ của biểu tượng "Loading" (hình vẽ SVG) trên trang Muse; đã sửa, và lỗi gửi giờ ghi rõ bằng tiếng Việt.
- Bật "Hiện các luồng chạy ngầm" giờ mở từng luồng thành một cửa sổ riêng (bấm X chỉ ẩn đi, luồng vẫn chạy).
- Việc đã lỗi ở bản trước: chọn các dòng Lỗi → **Tạo lại**.
