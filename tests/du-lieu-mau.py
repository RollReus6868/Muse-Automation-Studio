# Tạo thư mục dữ liệu mẫu để chụp giao diện: python3 tests/du-lieu-mau.py <thư-mục-dữ-liệu> <thư-mục-ra>
import json, os, sys, time, random
from PIL import Image, ImageDraw

du_lieu, ra = sys.argv[1], sys.argv[2]
os.makedirs(du_lieu, exist_ok=True)
os.makedirs(os.path.join(ra, 'Mac_dinh'), exist_ok=True)
random.seed(3)

def anh(path, w, h, mau):
    im = Image.new('RGB', (w, h), mau)
    d = ImageDraw.Draw(im)
    for i in range(3):
        y = h * (i + 1) // 4
        d.rectangle([w * 0.1, y - h * 0.1, w * 0.9, y + h * 0.08], outline=(30, 30, 30), width=max(2, w // 120))
        d.ellipse([w * 0.4, y - h * 0.07, w * 0.5, y], outline=(30, 30, 30), width=max(2, w // 120))
    im.save(path)

now = int(time.time() * 1000)
prompts = [
    'Tranh truyện người que tối giản, bố cục dọc 9:16 gồm 3 ô từ trên xuống dưới, nét đen rõ trên nền trắng, kể chuyện một người đi mua hoa',
    'Lan đứng trên ban công lúc hoàng hôn, ảnh chụp chân dung điện ảnh, ánh sáng vàng ấm',
    'Một chú mèo cam ngồi trên bậu cửa sổ lúc hoàng hôn, phong cách tranh màu nước',
    'Thành phố tương lai ban đêm, phong cách cyberpunk, đèn neon phản chiếu trên mặt đường ướt',
]
viec = []
for so in range(1, 15):
    tt = 'xong' if so <= 9 else ('loi' if so == 10 else ('chay' if so <= 12 else 'cho'))
    j = {'id': so, 'duAn': 'mac-dinh', 'so': so, 'loai': 'anh', 'prompt': f'{so}. ' + prompts[so % 4] if False else prompts[so % 4],
         'tyLe': '9:16', 'thamChieu': [], 'nhanVat': ['nv-lan'] if so % 4 == 1 else [], 'trangThai': tt,
         'buoc': 'tao' if tt == 'chay' else '', 'thread': '', 'taiKhoan': 'tk-1', 'files': [], 'loi': '', 'thu': 0,
         'taoLuc': now - 3600_000 + so * 1000, 'batDauLuc': now - (20_000 if so == 11 else 5_000) if tt == 'chay' else now - 600_000,
         'xongLuc': now - 500_000 + so * 30_000 if tt in ('xong', 'loi') else 0}
    if tt == 'xong':
        p = os.path.join(ra, 'Mac_dinh', f'Mac_dinh_{so:03d}.png')
        anh(p, 288, 512, (245, 238, 225) if so % 2 else (232, 240, 248))
        j['files'] = [p]
    if tt == 'loi':
        j['loi'] = 'Muse trả lời chữ, không có ảnh: "Bạn muốn ảnh theo phong cách nào?"'
    viec.append(j)
for so in range(1, 4):
    viec.append({'id': 100 + so, 'duAn': 'mac-dinh', 'so': 20 + so, 'loai': 'video', 'prompt': '{"scene_id":"%d","duration_sec":"8","visual_style":"Phong cách hoạt hình 3D hiện đại"}' % so,
                 'tyLe': '9:16', 'thamChieu': [], 'nhanVat': [], 'trangThai': 'cho', 'buoc': '', 'thread': '', 'taiKhoan': '', 'files': [], 'loi': '', 'thu': 0,
                 'taoLuc': now, 'batDauLuc': 0, 'xongLuc': 0})
nv_dir = os.path.join(du_lieu, 'nhan-vat', 'nv-lan')
os.makedirs(nv_dir, exist_ok=True)
anh(os.path.join(nv_dir, 'lan1.png'), 200, 200, (250, 220, 230))
data = {
    'duAn': [{'id': 'mac-dinh', 'ten': 'Mặc định', 'so': 23, 'taoLuc': now}, {'id': 'truyen', 'ten': 'Truyện người que', 'so': 0, 'taoLuc': now}],
    'viec': viec,
    'nhanVat': [{'id': 'nv-lan', 'ten': 'Lan', 'moTa': 'cô gái 20 tuổi, tóc ngắn', 'anh': [os.path.join(nv_dir, 'lan1.png')]}],
    'caiDat': {'thuMucRa': ra},
    'mauPrompt': [{'ten': 'Tranh truyện người que 9:16', 'noiDung': prompts[0]}],
    'taiKhoan': [{'id': 'tk-1', 'ten': 'Tài khoản 1', 'partition': 'persist:muse-tk-1', 'bat': True, 'trangThai': 'da-dang-nhap'},
                 {'id': 'muse-2', 'ten': 'Muse 2', 'partition': 'persist:muse-muse-2', 'bat': False, 'trangThai': 'chua-kiem'}],
}
json.dump(data, open(os.path.join(du_lieu, 'du-lieu.json'), 'w'), ensure_ascii=False)
print('ok', len(viec))
