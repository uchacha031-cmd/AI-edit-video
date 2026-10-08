/** Browser-side media downloads for apps embedded in AI Studio preview iframes.
 * Never save an authentication page masquerading as an MP4/SRT file.
 */
export type DownloadKind = 'mp4' | 'srt';

export function validateMediaBytes(bytes: Uint8Array, kind: DownloadKind, contentType = '', expectedBytes?: number): void {
  const mime = contentType.toLowerCase();
  if (mime.includes('text/html') || mime.includes('application/xhtml')) {
    throw new Error('AI Studio trả về trang xác thực HTML, không phải tệp video/phụ đề. Hãy mở lại Preview và thử tải lại.');
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(128, bytes.length))).trimStart().toLowerCase();
  if (prefix.startsWith('<!doctype html') || prefix.startsWith('<html') || prefix.includes('<title>cookie check</title>')) {
    throw new Error('Tệp tải về là trang kiểm tra cookie của AI Studio, không phải nội dung media.');
  }
  if (kind === 'mp4') {
    if (bytes.length < 32 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
      throw new Error('Máy chủ không trả về dữ liệu MP4 hợp lệ (thiếu chữ ký ftyp).');
    }
    if (Number.isFinite(expectedBytes) && expectedBytes! > 0) {
      const difference = Math.abs(bytes.length - expectedBytes!);
      if (difference > Math.max(4096, expectedBytes! * 0.03)) {
        throw new Error('Tệp MP4 tải về không đủ dữ liệu so với kết quả render. Vui lòng thử lại.');
      }
    }
  } else {
    if (bytes.length === 0) throw new Error('Tệp SRT rỗng.');
    const text = new TextDecoder('utf-8').decode(bytes);
    if (!/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(text)) {
      throw new Error('Dữ liệu nhận được không đúng định dạng phụ đề SRT.');
    }
  }
}

export async function downloadPreviewMedia(
  sourceUrl: string, filename: string, kind: DownloadKind, expectedBytes?: number
): Promise<void> {
  // Request from the running preview iframe to retain the iframe's authenticated context.
  const response = await fetch(sourceUrl, { method: 'GET', credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Không tải được nội dung từ máy chủ (HTTP ' + response.status + ').');
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateMediaBytes(bytes, kind, response.headers.get('content-type') || '', expectedBytes);
  const mime = kind === 'mp4' ? 'video/mp4' : 'text/plain;charset=utf-8';
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Mobile Chrome may still be consuming the blob after click().
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}
