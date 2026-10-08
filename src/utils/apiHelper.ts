/**
 * Safe fetch wrapper that handles JSON, HTML error pages, and network failures
 * without throwing "SyntaxError: Unexpected token '<', '<!doctype '... is not valid JSON".
 */

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

export async function fetchApiJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';

    let parsedData: any;

    if (contentType.includes('application/json')) {
      try {
        parsedData = await res.json();
      } catch (jsonErr: any) {
        const text = await res.text().catch(() => '');
        parsedData = {
          success: false,
          error: res.ok
            ? 'Phản hồi từ máy chủ không đúng định dạng JSON.'
            : `Máy chủ phản hồi mã lỗi ${res.status}`,
          technicalDetails: text.slice(0, 300),
        };
      }
    } else {
      // Non-JSON response (e.g. HTML 503/504/502/404 error page from reverse proxy or server)
      const rawText = await res.text().catch(() => '');
      let userFriendlyMessage = `Máy chủ phản hồi mã lỗi HTTP ${res.status}`;

      if (res.status === 503) {
        userFriendlyMessage = 'Dịch vụ AI đang tạm thời quá tải (HTTP 503). Vui lòng thử lại sau giây lát.';
      } else if (res.status === 504 || res.status === 502) {
        userFriendlyMessage = 'Kết nối tới máy chủ đã hết thời gian chờ (Gateway Timeout). Vui lòng thử lại.';
      } else if (res.status === 413) {
        userFriendlyMessage = 'Kích thước tệp video quá lớn so với giới hạn của máy chủ (tối đa 150MB).';
      } else if (res.status === 404) {
        userFriendlyMessage = 'Đường dẫn xử lý không tồn tại trên máy chủ (HTTP 404).';
      } else if (!res.ok) {
        userFriendlyMessage = `Yêu cầu xử lý gặp lỗi từ máy chủ (HTTP ${res.status}).`;
      }

      parsedData = {
        success: false,
        httpStatus: res.status,
        error: userFriendlyMessage,
        technicalDetails: rawText.startsWith('<!')
          ? `Mã phản hồi HTML (HTTP ${res.status})`
          : rawText.slice(0, 200),
      };
    }

    return {
      ok: res.ok && parsedData?.success !== false,
      status: res.status,
      data: parsedData as T,
    };
  } catch (networkErr: any) {
    // Network disconnection or fetch failure
    return {
      ok: false,
      status: 0,
      data: {
        success: false,
        error: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng.',
        technicalDetails: networkErr?.message || String(networkErr),
      } as unknown as T,
    };
  }
}
