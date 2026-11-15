#!/usr/bin/env node
/**
 * فحص سريع لوصول قاعدة البيانات (TCP فقط) قبل تشغيل الـ migrations.
 *
 * السبب: محاولة migration فاشلة على قاعدة غير متاحة بتاخد ~دقيقتين، فخمس
 * محاولات معناها 10 دقايق — المنصة بتعتبر النشر فاشل قبل ما نخلص.
 *
 * الخروج:
 *   0 = الوصول ممكن (أو الرابط غير قابل للتحليل) → كمّل migrations عادي
 *   1 = القاعدة غير متاحة → تخطَّ migrations وشغّل التطبيق فوراً
 *   2 = DATABASE_URL غير مضبوط
 */
const net = require('node:net');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('[precheck] DATABASE_URL غير مضبوط');
  process.exit(2);
}

let hostname = '';
let port = 5432;
try {
  const parsed = new URL(raw);
  hostname = parsed.hostname;
  port = Number(parsed.port || 5432);
} catch {
  // رابط بصيغة غير قياسية — ما نعطّلش التشغيل بسببه
  process.exit(0);
}

if (!hostname || hostname.startsWith('/')) {
  // اتصال عبر Unix socket (تطوير محلي)
  process.exit(0);
}

const timeoutMs = Math.max(1000, Number(process.env.DB_PRECHECK_TIMEOUT_MS) || 5000);
let settled = false;
const finish = (ok) => {
  if (settled) return;
  settled = true;
  console.log(
    ok
      ? `[precheck] ${hostname}:${port} متاح`
      : `[precheck] ${hostname}:${port} غير متاح خلال ${timeoutMs}ms`
  );
  process.exit(ok ? 0 : 1);
};

const socket = net.connect({ host: hostname, port });
socket.setTimeout(timeoutMs);
socket.once('connect', () => {
  socket.destroy();
  finish(true);
});
socket.once('timeout', () => {
  socket.destroy();
  finish(false);
});
socket.once('error', () => {
  socket.destroy();
  finish(false);
});
setTimeout(() => {
  socket.destroy();
  finish(false);
}, timeoutMs + 1000).unref();
