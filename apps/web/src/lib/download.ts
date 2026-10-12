import { api } from '@/lib/api';

/** ينزّل ملف من الـ API (مع التوكن) ويحفظه بالاسم المحدد. */
export async function downloadFromApi(
  path: string,
  filename: string,
  params?: Record<string, unknown>
) {
  const res = await api.get(path, { params, responseType: 'blob' });
  saveBlob(res.data as Blob, filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const money = (v: unknown) =>
  Number(v || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (v: unknown, digits = 0) =>
  Number(v || 0).toLocaleString('ar-EG', { maximumFractionDigits: digits });

export function apiErrorMessage(error: any, fallback = 'حدث خطأ غير متوقع'): string {
  const msg = error?.response?.data?.error?.message;
  if (Array.isArray(msg)) return msg.join('، ');
  return msg || fallback;
}
