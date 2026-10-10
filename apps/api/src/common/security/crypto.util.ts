import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { isIP } from 'net';

// ---------------------------------------------------------------------------
// تشفير متماثل AES-256-GCM (لتخزين أسرار مثل مفتاح المصادقة الثنائية)
// ---------------------------------------------------------------------------

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`blink-erp:enc:v1:${secret}`).digest();
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string, secret: string): string {
  const [version, iv, tag, data] = String(payload).split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — متوافق مع Google Authenticator / Microsoft Authenticator / Authy
// ---------------------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

const TOTP_STEP_SECONDS = 30;

export function totpAt(secretBase32: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]) %
    10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function currentTotpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_STEP_SECONDS);
}

/**
 * يتحقق من رمز TOTP مع سماحية ±1 خطوة (30 ثانية) لفروق الساعة.
 * يرجع رقم الخطوة المطابقة (لمنع إعادة استخدام نفس الرمز) أو null.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: { window?: number; lastUsedStep?: number | null; now?: number } = {}
): number | null {
  const code = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const window = options.window ?? 1;
  const current = currentTotpStep(options.now);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;
    const expected = totpAt(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

export function totpUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

// ---------------------------------------------------------------------------
// قائمة IPs المسموح لها (تدعم IP مفرد و IPv4 CIDR مثل 41.33.0.0/16)
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function normalizeIp(ip: string): string {
  return String(ip || '')
    .trim()
    .replace(/^::ffff:/, '');
}

export function parseIpAllowlist(raw?: string | null): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  const addr = normalizeIp(ip);
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      const [base, bitsRaw] = entry.split('/');
      const bits = Number(bitsRaw);
      if (isIP(addr) === 4 && isIP(base) === 4 && bits >= 0 && bits <= 32) {
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        if ((ipv4ToInt(addr) & mask) === (ipv4ToInt(base) & mask)) return true;
      }
    } else if (normalizeIp(entry) === addr) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// مفاتيح عشوائية وبصمات
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
