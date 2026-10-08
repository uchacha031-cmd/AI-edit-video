# Nghiên cứu thiết kế biên tập tự động — 2026-10-08

## Quy tắc triển khai
- Chỉ sử dụng **nguyên lý kỹ thuật và kinh nghiệm thiết kế**, viết mã độc lập; không sao chép nguồn của dự án thứ ba.
- Không xem sản phẩm nhiều sao là bằng chứng về tính đúng đắn. Mọi thay đổi phải có thử nghiệm tái tạo được.
- Phân biệt dữ liệu đo bởi FFmpeg, suy luận của Gemini, và hành động chỉnh sửa của người dùng.

## Các nguồn và quyết định

| Nguồn | Kinh nghiệm đã kiểm chứng | Áp dụng | Không áp dụng |
|---|---|---|---|
| [Auto-Editor](https://github.com/WyattBlue/auto-editor), [skill workflow](https://github.com/WyattBlue/auto-editor/blob/master/skills/auto-editor/SKILL.md) | Thêm khoảng đệm quanh khoảng lặng, làm mượt đoạn cắt nhỏ; có bước xem trước | `buildConservativeEditTimeline`: biên an toàn sau lời nói 0.18s, trước lời nói 0.25s; không cắt hơi thở ngắn; gộp khoảng lặng kề nhau | Không tích hợp nguyên công cụ hoặc tính năng edit-by-motion chưa kiểm nghiệm |
| [PySceneDetect](https://www.scenedetect.com/docs/latest/api/detectors.html) | Các thuật toán phát hiện thay đổi cảnh có thể dựa vào thay đổi màu/cường độ/rolling window; cảnh chuyển không đồng nghĩa với highlight | Phát hiện scene cut bằng FFmpeg chọn frame thay đổi màu, giảm FPS/kích thước và giới hạn thời gian; chỉ chuyển timestamp có kiểm tra cho Gemini | Không tuyên bố tương đương AdaptiveDetector hay hiểu nội dung cảnh |
| [LosslessCut troubleshooting](https://github.com/mifi/lossless-cut/blob/master/docs/troubleshooting.md) | Cắt stream-copy theo keyframe có thể lệch khung và sai sync | Giữ cách trim + encode qua filter graph, test âm thanh, thời lượng, chất lượng file thực tế | Không thêm chế độ stream copy khi chưa có test keyframe chính xác |
| [OpenCut](https://github.com/clementrx/opencut) | Tách editor core và giao diện, hỗ trợ headless/automation; dự án đang trong giai đoạn viết lại | Duy trì module độc lập `server/editing.ts` và test bằng CLI | Không kéo Rust core/plugin mới làm phức tạp app AI Studio |

## Coverage & giới hạn
- Phân tích cảnh tự động chỉ lấy **tối đa 90 giây đầu video** trong bước AI, do giới hạn CPU/timeout. Prompt nói rõ phạm vi; không kết luận cho đoạn ngoài phạm vi.
- FFmpeg scene score chỉ là *ứng viên chuyển cảnh*, không phải đánh giá hấp dẫn hay xác định đối tượng.
- Chế độ offline **không có transcript, hiểu nghĩa, nhận diện highlight**, và không cắt bỏ nội dung nói chỉ để đạt mục tiêu độ dài.
- Các thông số margin là mặc định bảo thủ, không tối ưu cho mọi giọng nói/tốc độ.
- Cần thử thực tế video nhiều góc quay, giọng nói nhỏ, ngắt nghỉ dài, clip không âm thanh, camera rung, video dài và màu gần nhau.

## Thử nghiệm tái tạo
- `npm test`: FFmpeg renderer + audio + timestamp/subtitle + scene cuts + khoảng lặng biên.
- `node tests/http.cjs`: máy chủ Express HTTP API.
- `npm run lint` và `npm run build`: kiểm tra kiểu và build.
- Chạy CI trên GitHub trước khi merge main. Không tự nhận đã thử nghiệm AI Studio/Gemini nếu chưa có bằng chứng.
