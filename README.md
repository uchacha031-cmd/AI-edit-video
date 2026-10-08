# AI Auto Video Editor

AI Auto Video Editor là ứng dụng React/Vite + Express phục vụ quy trình tải video, phân tích media, tạo kế hoạch biên tập bằng Gemini, dựng MP4 bằng FFmpeg và xem trước kết quả.

## Sử dụng trên Google AI Studio
- Dự án đã liên kết với GitHub repository này ở nhánh `main`.
- Sau khi mã nguồn trên GitHub cập nhật, mở **Settings → GitHub → Check sync status**, rồi chọn **Pull changes from GitHub** khi tùy chọn xuất hiện. Không đẩy ngược bản mã nguồn cũ từ AI Studio lên GitHub.
- Kiểm tra Preview và chạy thử video mẫu trước khi tải video riêng tư.
- Nếu gặp 503, thử lại sau hoặc chọn chế độ cắt khoảng lặng cơ bản (không phải AI).

## Chạy và kiểm thử
1. Cài Node.js 22+, FFmpeg và ffprobe.
2. `npm install`
3. Copy `.env.example` thành `.env`, cấu hình `GEMINI_API_KEY` bằng secrets của máy chủ. Không commit `.env`.
4. `npm run dev` → mở giao diện do máy chủ cung cấp.
5. `npm run lint`; `npm run build`; `npm test`; `node tests/http.cjs`.

GitHub Actions chạy kiểm tra TypeScript, build, FFmpeg và HTTP API. Endpoint `GET /api/health` trả thông tin trạng thái cấu hình không nhạy cảm.

## Tính năng và hạn chế
- Cắt/ghép theo thứ tự timeline, kiểm tra thời điểm phân đoạn, sinh phụ đề SRT bám theo đoạn giữ lại.
- Dựng video với zoom tĩnh theo từng đoạn, punch-in giữa một số đoạn, fade-to-black ngắn, điều chỉnh màu và chuẩn hóa/tăng âm lượng.
- Hiển thị tiến độ dựng theo FFmpeg; hỗ trợ hủy render. Xuất 720p hoặc 1080p.
- Có chế độ cắt khoảng lặng theo quy tắc khi Gemini không khả dụng, không giả lập kết quả nhận diện video.
- **Chưa có** hiệu ứng crossfade thực sự, zoom chuyển động liên tục, xác thực người dùng, cách ly media theo tài khoản hay bảo đảm Gemini luôn khả dụng.
- Không nên phát hành công khai cho người khác tải video riêng tư khi chưa có đăng nhập, kiểm soát truy cập và thời hạn xóa dữ liệu.

Các thư mục tạm `temp_storage/`, tệp `.env`, và ZIP tự sinh được loại khỏi Git qua `.gitignore`.
