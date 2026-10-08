/**
 * Utility for parsing technical backend and AI errors into natural Vietnamese messages
 * while preserving raw details for developer/debug inspection.
 */

export interface ParsedError {
  userMessage: string;
  technicalDetails: string | null;
}

export function parseAppError(raw: any): ParsedError {
  if (!raw) {
    return {
      userMessage: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.',
      technicalDetails: null,
    };
  }

  const rawString = typeof raw === 'string' ? raw : (raw.message || raw.error || JSON.stringify(raw));
  const lower = rawString.toLowerCase();

  // 503 / High demand / Model overloaded
  if (
    lower.includes('503') ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('spikes in demand')
  ) {
    return {
      userMessage: 'Hiện máy chủ AI đang quá tải nên chưa thể phân tích video. Hệ thống đã kích hoạt phương án dựng thông minh từ âm thanh, hoặc bạn có thể thử lại sau.',
      technicalDetails: rawString,
    };
  }

  // 429 / Quota / Rate limit
  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('too many requests')
  ) {
    return {
      userMessage: 'Hệ thống AI tạm thời đạt giới hạn lượt yêu cầu. Vui lòng chờ vài giây rồi thử lại.',
      technicalDetails: rawString,
    };
  }

  // Timeout / Quá thời gian chờ
  if (
    lower.includes('timeout') ||
    lower.includes('quá thời gian') ||
    lower.includes('timed out') ||
    lower.includes('deadline exceeded')
  ) {
    return {
      userMessage: 'Thời gian phân tích video bị quá hạn do kết nối mạng hoặc tệp video dài. Vui lòng bấm thử lại.',
      technicalDetails: rawString,
    };
  }

  // 400 / Invalid Argument / Bad Request
  if (
    lower.includes('invalid') ||
    lower.includes('400') ||
    lower.includes('not supported') ||
    lower.includes('codec')
  ) {
    return {
      userMessage: 'Định dạng video hoặc thông số kỹ thuật chưa được hỗ trợ. Vui lòng chọn tệp MP4 hoặc WebM hợp lệ.',
      technicalDetails: rawString,
    };
  }

  // Upload or storage failure
  if (
    lower.includes('upload') ||
    lower.includes('storage') ||
    lower.includes('file too large') ||
    lower.includes('multer')
  ) {
    return {
      userMessage: 'Tải video lên máy chủ thất bại. Vui lòng kiểm tra kết nối mạng và dung lượng tệp (tối đa 150MB).',
      technicalDetails: rawString,
    };
  }

  // FFmpeg / render failure
  if (
    lower.includes('render') ||
    lower.includes('ffmpeg') ||
    lower.includes('encode') ||
    lower.includes('mux')
  ) {
    return {
      userMessage: 'Quá trình dựng video bằng FFmpeg gặp sự cố kỹ thuật. Vui lòng thử lại hoặc điều chỉnh các đoạn cắt.',
      technicalDetails: rawString,
    };
  }

  // Generic ApiError / Gemini errors
  if (lower.includes('apierror') || lower.includes('google') || lower.includes('gemini')) {
    return {
      userMessage: 'Dịch vụ AI phản hồi chậm hoặc tạm thời không thể xử lý. Vui lòng thử lại sau.',
      technicalDetails: rawString,
    };
  }

  // If already clean Vietnamese without error stack trace
  if (!rawString.includes('Error:') && !rawString.includes('at ') && !rawString.includes('{') && rawString.length < 150) {
    return {
      userMessage: rawString,
      technicalDetails: null,
    };
  }

  return {
    userMessage: 'Đã xảy ra sự cố trong quá trình xử lý. Vui lòng thử lại sau.',
    technicalDetails: rawString,
  };
}
