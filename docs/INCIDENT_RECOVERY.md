# تشخيص وإنقاذ السيستم لما يوقف

الدليل ده للوقت اللي السيستم بيبان فيه واقف: الصفحة مش بتفتح، تسجيل الدخول بيفشل، أو كل حاجة بطيئة جدًا.

## أول حاجة: شغّل الفحص

```bash
./scripts/check-system.sh
# أو على رابط تاني
./scripts/check-system.sh https://erp-api-dad5.onrender.com
```

الفحص بيقولك بالظبط إيه اللي واقع: الخدمة، قاعدة البيانات، ولا الواجهة.

---

## التشخيص في 30 ثانية

| اللي بتشوفه | المعنى | الحل السريع |
| --- | --- | --- |
| صفحة **Render "Application loading"** بتفضل دقيقة+ | خدمة Render المجانية كانت نائمة، أو لسه بتقلع | استنى 60 ثانية وأعد التحميل؛ لو فضلت، راجع Deploy Logs |
| `504 / 502` من الـ API | الخدمة بتموت أثناء الإقلاع (غالبًا قاعدة البيانات) | راجع Logs، وتأكد إن `DATABASE_URL` والقاعدة شغالين |
| تسجيل الدخول بيرجع خطأ شبكة/`CORS` | الواجهة مش قادرة توصل للـ API (رابط قديم أو خدمة واقفة) | راجع `VITE_API_URL` أو استخدم الحل الموحّد تحت |
| `/api/v1/health` بيرجع `503` و`database: unavailable` | التطبيق شغال لكن قاعدة البيانات واقفة (Supabase Paused) | Supabase → Restore project |
| الواجهة `404 DEPLOYMENT_NOT_FOUND` | **نشر الواجهة نفسه مش موجود** (اتمسح/اتنقل) | أعد النشر، أو قدّم الواجهة من خدمة الـ API (الحل الموحّد) |
| السيستم بطيء أول طلب في اليوم بس | نوم الخدمة المجانية | الـ keep-alive أوتوماتيك كل 10 دقايق (`keep-alive.yml`) |

---

## الأسباب الشائعة وطريقة الإصلاح

### 1) خدمة Render المجانية نامت (الأشهر)

الخطة المجانية بتوقف الخدمة بعد **15 دقيقة** بدون طلبات، وأول طلب بعدها بياخد من 30 لـ 60 ثانية.

- **حل دائم:** الـ workflow في `.github/workflows/keep-alive.yml` بيضرب `/api/v1/health` كل 10 دقايق، فبيمنع النوم.
- **تفعّله:** Settings → Actions → General → Allow all actions، وبعد كده شوفه في تاب Actions → Keep alive → Run workflow.
- تقدر تغيّر الرابط من Settings → Variables → `API_HEALTH_URL`.

### 2) قاعدة بيانات Supabase اتقفلت مؤقتًا

مشروع Supabase المجاني بيتوقف (Paused) بعد أسبوع بدون نشاط. عندها `/api/v1/health` بيرجع `503`، والسيستم ما يقدرش يقرأ ولا يكتب.

- Supabase Dashboard → المشروع → **Restore / Resume**.
- نفس الـ keep-alive بيلمس قاعدة البيانات كل 10 دقايق (لأن `/api/v1/health` بينفذ `SELECT 1`)، فبيمنع التوقف تاني.
- لو الاستخدام زاد، راجع حدود الخطة.

### 3) فشل الـ deploy أو الـ start

السبب القديم: أمر التشغيل كان

```
npm run db:migrate:prod && npm run db:seed:prod && npm run start:prod
```

أي فشل في الـ seed أو الـ migration كان بيمنع تشغيل الخدمة **بالكامل**، فتظهر كأنها واقفة.

بقى الآن `scripts/start-production.sh`:

- فحص سريع للقاعدة (5 ثوانٍ). السبب: محاولة migration فاشلة على قاعدة غير متاحة
  بتاخد ~**دقيقتين**، فخمس محاولات = 10 دقايق، والمنصة تعتبر النشر فاشل.
- الـ migrations بتتعاد مرتين بس.
- الـ seed **مش قاتل**: لو فشل بيكمّل تشغيل.

### الخدمة بتفضل شغالة حتى لو قاعدة البيانات واقعة

`main.ts` بيمسك المنفذ فورًا بسيرفر مؤقت، وبعدها بيحاول يشبك Nest:

| الحالة | اللي بيحصل |
| --- | --- |
| القاعدة متاحة | التطبيق بيشتغل عادي في ثواني |
| القاعدة واقعة | السيرفر بيرد صفحة صيانة عربية واضحة (503) و`/api/v1/health/live` بيرد 200 |
| القاعدة رجعت | التطبيق بيلتحق بنفس السيرفر تلقائيًا خلال ثوانٍ — **مش محتاج إعادة نشر** |

يعني المستخدم مش هيشوف صفحة ميتة أو `502` تاني، وهيعرف إن المشكلة في قاعدة البيانات.

كمان فحص الصحة على Render بقى `/api/v1/health/live` (من غير قاعدة بيانات)، فقاعدة نائمة مش هتخلي المنصة تعلن إن النشر فاشل.

### 4) نشر الواجهة مش موجود

الواجهة كانت منشورة على Vercel بشكل منفصل، وده كان أول ما يقع أو يتمسح من غير ما حد ياخد باله (`404 DEPLOYMENT_NOT_FOUND`).

**الحل الموحّد (المفضّل):** خدمة الـ API بتقدّم الواجهة كمان من نفس الرابط.

- أثناء الـ build بينسخ `apps/web/dist` إلى `apps/api/public`.
- `main.ts` بيقدّم الملفات ويعمل SPA fallback لأي مسار مش تحت `/api`.
- الفايدة: رابط واحد، مفيش CORS، مفيش Cookies طرف ثالث، ومفيش نشر منفصل يقع.

على Render (Blueprint):

```yaml
rootDir: .
buildCommand: npm ci --include=dev && npm run build && rm -rf apps/api/public && cp -r apps/web/dist apps/api/public
startCommand: bash scripts/start-production.sh
healthCheckPath: /api/v1/health/live
```

وبعدها افتح نفس رابط الخدمة (`https://erp-api-dad5.onrender.com`) — هتلاقي الواجهة.

> لو لسه عايز Vercel للواجهة: اضبط `VITE_API_URL=https://<api>/api/v1` و`FRONTEND_URL` على Render بنفس أصل الواجهة.

### 5) متغيرات بيئة ناقصة

السيرفر بيرفض يشتغل في الإنتاج لو فيه سر ضعيف أو ناقص (رسالة واضحة في الـ Logs). راجع:

```
DATABASE_URL, FRONTEND_URL, PUBLIC_APP_URL,
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_MASTER_SECRET (كل واحد 32+ حرف ومختلفين),
MASTER_ADMIN_EMAIL, MASTER_ADMIN_PASSWORD
```

---

## إعادة التشغيل خطوة بخطوة

1. **Render** → خدمة `erp-api` → **Manual Deploy → Deploy latest commit**.
2. راقب **Logs** لحد ما تشوف `🚀 Application is running on port ...`.
3. لو ظهر `🖥️ Web app served from ...` فالواجهة شغالة من نفس الخدمة.
4. شغّل `./scripts/check-system.sh`.
5. افتح الرابط وسجّل دخول.

## بعد ما السيستم يرجع

- شوف **Actions → Keep alive** أنه شغال (ده اللي بيمنع تكرار المشكلة).
- ثبّت مراقبة خارجية مجانية (UptimeRobot مثلاً) على `/api/v1/health/live` و`/api/v1/health`.
- خد نسخة احتياطية: `./scripts/backup-postgres.sh` أو التصدير من شاشة الإعدادات.

## التحقق المحلي قبل أي نشر

```bash
npm ci
npm run build
npm run typecheck
npm run test --workspace @erp/api
```

والتشغيل الكامل محليًا:

```bash
cp .env.example .env      # واضبط DATABASE_URL
npm run db:migrate
npm run db:seed
npm run dev
```
