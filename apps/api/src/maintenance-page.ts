/**
 * صفحة صيانة بتتقدم لما قاعدة البيانات تكون غير متاحة (مثلاً مشروع Supabase
 * متوقف مؤقتاً). الهدف: المستخدم يشوف سبب واضح بدل صفحة ميتة أو 502.
 */
export function maintenancePageHtml(): string {
  const checkedAtAr = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date());

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>صيانة مؤقتة — Blink ERP</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    background: #0f172a; color: #e2e8f0; padding: 24px;
  }
  .card {
    max-width: 620px; width: 100%; background: #1e293b;
    border: 1px solid #334155; border-radius: 16px; padding: 28px 26px;
    box-shadow: 0 20px 50px rgba(0,0,0,.35);
  }
  .badge {
    display: inline-block; background: #422006; color: #fbbf24;
    border: 1px solid #78350f; border-radius: 999px;
    padding: 4px 12px; font-size: 13px; margin-bottom: 16px;
  }
  h1 { margin: 0 0 10px; font-size: 22px; }
  p { line-height: 1.9; margin: 0 0 14px; color: #cbd5e1; }
  ul { margin: 0 0 16px; padding-inline-start: 22px; line-height: 1.9; color: #cbd5e1; }
  code {
    background: #0f172a; border: 1px solid #334155; border-radius: 6px;
    padding: 1px 6px; font-size: 13px; direction: ltr; display: inline-block;
  }
  .meta { font-size: 13px; color: #94a3b8; border-top: 1px solid #334155; padding-top: 12px; }
  a { color: #60a5fa; }
</style>
</head>
<body>
  <main class="card">
    <span class="badge">صيانة مؤقتة</span>
    <h1>السيستم متاح، لكن قاعدة البيانات غير متصلة حالياً</h1>
    <p>
      التطبيق شغّال، لكنه مش قادر يوصل لقاعدة البيانات، فمش ممكن تحميل بيانات
      المتاجر أو تسجيل الدخول في الوقت الحالي. البيانات نفسها سليمة ومحفوظة.
    </p>
    <p><strong>لو أنت مدير النظام:</strong></p>
    <ul>
      <li>افتح لوحة مزوّد قاعدة البيانات (Supabase مثلاً) واستأنف المشروع لو حالته <code>Paused</code>.</li>
      <li>تأكد إن متغيّر <code>DATABASE_URL</code> صحيح على منصة التشغيل.</li>
      <li>الصفحة هتشتغل تلقائياً بمجرد ما الاتصال يرجع — مش محتاج إعادة نشر.</li>
    </ul>
    <p class="meta">آخر فحص: ${checkedAtAr}</p>
  </main>
</body>
</html>`;
}
