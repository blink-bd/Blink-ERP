/**
 * عميل HTTP بسيط للاختبارات: يحفظ الكوكيز (HttpOnly) ويضيف هيدر CSRF تلقائياً،
 * تماماً كما يفعل المتصفح مع الواجهة الحقيقية.
 */
export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export class TestClient {
  private cookies = new Map<string, string>();
  private csrfToken?: string;

  /** عنوان IP وهمي يُرسل في X-Forwarded-For (السيرفر يثق بـ proxy واحد) — لمحاكاة أكثر من جهاز. */
  constructor(
    private readonly baseUrl: string,
    private readonly forwardedFor?: string
  ) {}

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private storeCookies(headers: Headers): void {
    const raw: string[] =
      typeof (headers as any).getSetCookie === 'function'
        ? (headers as any).getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];
    for (const item of raw) {
      const [pair] = item.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /expires=thu, 01 jan 1970/i.test(item)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  hasCookie(name: string): boolean {
    return this.cookies.has(name);
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clearCookies(): void {
    this.cookies.clear();
    this.csrfToken = undefined;
  }

  async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const response = await this.request('GET', '/api/v1/auth/csrf');
    this.csrfToken = response.body?.data?.csrfToken;
    if (!this.csrfToken) throw new Error('تعذر الحصول على رمز CSRF');
    return this.csrfToken;
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    options: { csrf?: boolean; formData?: FormData; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (this.forwardedFor) headers['X-Forwarded-For'] = this.forwardedFor;
    const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    // لازمة قبل قراءة الكوكيز: الطلب الأول يجلب كوكي CSRF ثم نُرسلها مع نفس الطلب.
    if (unsafe && options.csrf !== false) headers['X-CSRF-Token'] = await this.ensureCsrf();
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    let payload: BodyInit | undefined;
    if (options.formData) {
      payload = options.formData;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
    });
    this.storeCookies(response.headers);
    const text = await response.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      /* نص غير JSON */
    }
    return { status: response.status, body: parsed, headers: response.headers };
  }

  get<T = any>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, undefined, { headers });
  }
  post<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body, { headers });
  }
  put<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('PUT', path, body, { headers });
  }
  patch<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('PATCH', path, body, { headers });
  }
  del<T = any>(path: string, headers?: Record<string, string>) {
    return this.request<T>('DELETE', path, undefined, { headers });
  }
}

/** توليد رمز TOTP (RFC 6238) لاختبار المصادقة الثنائية بدون تطبيق خارجي. */
export function totpCode(secretBase32: string, timestamp = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secretBase32.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  const step = Math.floor(timestamp / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step % 2 ** 32, 4);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('node:crypto');
  const digest: Buffer = createHmac('sha1', bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** صورة PNG صغيرة صحيحة (1x1) لاختبار رفع مرفقات الفواتير. */
export const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
