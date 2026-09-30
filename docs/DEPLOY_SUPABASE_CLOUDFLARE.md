# النشر على GitHub + Supabase + Cloudflare

## الصورة الكاملة: كل خدمة بتعمل إيه

| الخدمة | بتشغّل إيه | مطلوبة؟ |
|---|---|---|
| **GitHub** | تخزين الكود | ✅ |
| **Supabase** | قاعدة البيانات PostgreSQL | ✅ |
| **Cloudflare Pages** | الواجهة (apps/web) | ✅ |
| **Render** (أو Railway / Fly.io) | **الباك إند NestJS (apps/api)** | ✅ **ده الناقص** |

## ليه محتاج خدمة رابعة؟

الباك إند (NestJS) برنامج Node.js شغّال طول الوقت بيكلّم قاعدة البيانات.
- **Supabase** قاعدة بيانات (+ خدمات جاهزة)، مش بتشغّل كود NestJS بتاعنا.
- **Cloudflare Pages** بيستضيف ملفات ثابتة (الواجهة) بس. وCloudflare Workers مش بيشغّل NestJS بشكل طبيعي.

فالأسهل: Render (مجاني للبداية). ملف `render.yaml` جاهز.

## اللي مش محتاجه
- **Redis** و **MinIO** اللي في `docker-compose.yml`: الكود الحالي مش بيستخدمهم. للتشغيل المحلي بس.
- **Google Apps Script**: مش مناسب للمشروع ده.

---

## الخطوة 1: GitHub
ارفع الكود (`git init` ... `git push`) زي ما في `DEPLOYMENT.md`.

## الخطوة 2: Supabase (قاعدة البيانات)
1. أنشئ مشروع جديد على supabase.com وحفظ **Database Password**.
2. افتح **SQL Editor** ونفّذ مرة واحدة:
   ```sql
   create extension if not exists "uuid-ossp";
   create extension if not exists pg_trgm;
   ```
3. اضغط زر **Connect** أعلى الصفحة → اختار **Session pooler** وانسخ الرابط (بيبدأ بـ `postgres://postgres.xxxx:...@aws-...pooler.supabase.com:5432/postgres`).
   - استخدم **Session pooler (بورت 5432)** مش Transaction pooler (6543)، لأن الـ migrations مش بتشتغل مع الأخير.
   - الرابط المباشر (Direct) بيحتاج IPv6 وRender المجاني مش بيدعمه، فالـ Session pooler هو الصح.
4. استبدل `[YOUR-PASSWORD]` في الرابط بالباسورد.

## الخطوة 3: الباك إند على Render
1. render.com → **New +** → **Blueprint** → اختار الـ Repository.
2. هيطلب منك قيم المتغيرات:
   - `DATABASE_URL` = رابط Supabase من الخطوة 2
   - `FRONTEND_URL` = اكتب أي قيمة مؤقتة (هتعدّلها في الخطوة 5)
3. بعد ما يخلص هتاخد رابط زي `https://erp-api-xxxx.onrender.com`.
4. جرّب `https://erp-api-xxxx.onrender.com/api/docs`.

## الخطوة 4: الواجهة على Cloudflare Pages
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → اختار الـ Repository.
2. الإعدادات:
   - **Root directory**: `apps/web`
   - **Build command**: `npm install && npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `VITE_API_URL` = `https://erp-api-xxxx.onrender.com/api/v1`
3. **Save and Deploy** → هتاخد رابط زي `https://xxxx.pages.dev`.

## الخطوة 5: ربط الاتنين
في Render → `erp-api` → Environment → عدّل `FRONTEND_URL` لرابط Cloudflare (بدون `/` في الآخر). الخدمة هتعيد التشغيل لوحدها.

## الخطوة 6: أول تاجر
افتح `https://erp-api-xxxx.onrender.com/api/docs` → `POST /api/v1/admin/tenants` (البيانات في `INSTALL_GUIDE.md`) → انسخ `tenant.id` → افتح رابط Cloudflare وسجّل دخول.

---

## تحذيرات مهمة

1. **الـ endpoints بتاعة `/admin/*` (إنشاء التجار وتعديل الميزات) مفتوحة بدون حماية** في النسخة الحالية. طالما الباك إند على الإنترنت، أي حد يعرف الرابط يقدر يستخدمها. لازم تضيف حماية (Master Admin Guard) قبل ما تشغّله لعملاء حقيقيين، أو على الأقل متنشرش رابط الـ API.
2. **الكود اتكتب لكن ما اتشغّلش ولا اتختبر** (بيئتي مفيهاش إنترنت لتثبيت الحزم). توقّع إن أول Build أو تشغيل يظهر أخطاء بسيطة (حزمة ناقصة، خطأ TypeScript...). ابعتلي نص الخطأ وأصلحه معاك.
3. Render المجاني بينام بعد 15 دقيقة خمول، وأول طلب بعدها بياخد ثواني.
4. تسجيل الدخول حاليًا بيطلب Tenant ID يدويًا (مؤقت). لاحقًا يتحسّن بدومين لكل تاجر.

---

## المدير العام (Master Admin) — حماية جديدة

النظام دلوقتي بقى فيه نظام دخول منفصل تمامًا لإدارة كل التجار، بتوكن ومفتاح سري خاص بيه (`JWT_MASTER_SECRET`) غير مرتبط بحسابات التجار خالص. مسارات `/admin/*` كلها بقت محمية ومحدش يقدر يوصلها من غير ما يسجّل دخول كمدير عام.

### إعداده على Render
في `render.yaml` (أو من Environment مباشرة) لازم تحدد:

| المتغير | القيمة |
|---|---|
| `JWT_MASTER_SECRET` | Render بيولّده تلقائيًا (`generateValue: true`) — ما تلمسهوش |
| `MASTER_ADMIN_EMAIL` | إيميلك الشخصي، مثال: `you@yourbusiness.com` |
| `MASTER_ADMIN_PASSWORD` | كلمة مرور قوية: 12 حرف على الأقل، فيها حرف كبير وصغير ورقم ورمز |

عند أول تشغيل (`npm run db:seed:prod`) هيتعمل حساب المدير العام تلقائيًا بالبيانات دي.

### الدخول على لوحة المدير العام
افتح رابط الواجهة على Cloudflare + `/admin/login`، مثال:
```
https://xxxx.pages.dev/admin/login
```
سجّل دخول بالإيميل وكلمة المرور اللي حطيتهم في `MASTER_ADMIN_PASSWORD`. من هنا تقدر:
- تنشئ تجار جدد (بدل ما تستخدم Swagger)
- توقف/تفعّل أي تاجر
- تتحكم في تاريخ انتهاء الاشتراك والخطة
- تفعّل/توقف ميزات معينة لكل تاجر
- تغيّر كلمة مرور أي مستخدم تاجر لو نسيها
- تشوف سجل كل العمليات الإدارية (Audit Log)

### تغيير كلمة مرور المدير العام لاحقًا
من نفس الحساب: `POST /api/v1/admin/auth/change-password` (أو هنضيفله زرار في الواجهة لاحقًا لو حبيت).

⚠️ **لو غيّرت `MASTER_ADMIN_PASSWORD` في Render بعد أول تشغيل، مش هتتغير تلقائي.** لازم تضيف متغير مؤقت `MASTER_ADMIN_RESET_PASSWORD=true` وتعمل Redeploy، وبعدها ارجع شيله.
