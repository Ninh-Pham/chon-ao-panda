# Bản GitHub Pages — Chọn áo cho anh em Panda

1. Chạy toàn bộ `setup-supabase.sql` trong Supabase SQL Editor. Khi nâng cấp từ v5, bước này bổ sung quyền sửa/xóa và không làm mất dữ liệu cũ.
2. Làm theo câu lệnh ở cuối tệp SQL để đổi `CHANGE-ME-2026` thành mã quản trị riêng.
3. Mở `config.js`, điền Project URL và Publishable key (hoặc anon key cũ).
4. Đưa toàn bộ tệp trong thư mục này vào thư mục gốc của repository GitHub.
5. Trong repository, mở **Settings → Pages → Source** và chọn **GitHub Actions**.
6. Workflow đi kèm sẽ tự xuất bản trang khi nhánh `main` thay đổi.

Sau khi trang chạy, quản trị viên bấm **Quản trị** để đăng mẫu áo trước. Anh em chỉ cần chọn một mẫu trong kho, bấm **Chọn mẫu này** rồi điền thông tin.

Kho mẫu ban đầu không có dữ liệu minh hoạ. Khi đăng ảnh, ứng dụng tự tối ưu ảnh JPG, PNG hoặc WEBP (ảnh gốc tối đa 20 MB) và báo kết quả ngay trong cửa sổ Quản trị. Nếu thông báo yêu cầu cập nhật Supabase, hãy chạy lại toàn bộ `setup-supabase.sql` rồi thử lại.

## Dùng trên điện thoại

- Thanh điều hướng nhanh nằm ở cuối màn hình: **Mẫu áo**, **Đội hình**, **Kết nối** và **Quản trị**.
- Thành viên bấm **Mẫu áo → Chọn mẫu này**, điền thông tin rồi bấm nút hoàn tất ở cuối form.
- Quản trị viên bấm **Quản trị** ở thanh dưới, nhập mã rồi bấm **Xác thực quản trị** để đăng ảnh, sửa/xóa đăng ký, ẩn/hiện mẫu và cập nhật trạng thái đơn.
- Danh sách đội và danh sách quản trị tự chuyển thành thẻ dọc, không cần kéo ngang.

Panda Control v6 dùng phong cách đen–trắng ngà, điểm nhấn xanh jade, chữ và ảnh áo lớn hơn trên cả máy tính lẫn điện thoại. Để dùng nút **Sửa/Xóa** với dữ liệu chung, bắt buộc chạy lại tệp SQL v6 một lần.

Publishable/anon key là khoá phía trình duyệt và được giới hạn bởi RLS trong `setup-supabase.sql`. Tuyệt đối không đưa secret key hoặc service_role key lên GitHub.
