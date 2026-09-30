# دليل التنصيب والتشغيل الكامل - خطوة بخطوة

هذا الدليل يفترض أن ملفات المشروع (هذه الحزمة) موجودة بالفعل عندك، فقط اتبع الخطوات لتركيب المتطلبات وتشغيل المشروع.

---

## المتطلبات الأساسية (Prerequisites)

### 1. تثبيت Node.js

**Windows:**
1. اذهب إلى https://nodejs.org/
2. حمّل النسخة LTS (18.x أو أحدث)
3. شغّل الملف المحمل واتبع خطوات التثبيت (Next, Next, Install)
4. تأكد من تفعيل خيار "Add to PATH"

**التحقق من التثبيت:**
```bash
node -v   # v18.x.x أو أحدث
npm -v    # 9.x.x أو أحدث
```

### 2. تثبيت Git

**Windows:** https://git-scm.com/download/win — تثبيت بالإعدادات الافتراضية.

```bash
git --version
```

### 3. تثبيت Docker Desktop

**Windows:** https://www.docker.com/products/docker-desktop/
شغّل التثبيت، أعد تشغيل الجهاز لو طُلب منك، ثم افتح Docker Desktop وانتظر "Docker Desktop is running".

```bash
docker --version
docker-compose --version
```

### 4. تثبيت Rust (مطلوب لـ Tauri)

https://www.rust-lang.org/tools/install → حمّل `rustup-init.exe` → اختر `1` (تثبيت افتراضي).

```bash
rustc --version
cargo --version
```

### 5. تثبيت Visual Studio C++ Build Tools (لـ Tauri على Windows)

https://visualstudio.microsoft.com/downloads/ → "Build Tools for Visual Studio 2022" → اختر "Desktop development with C++" → Install.

### 6. (اختياري) PostgreSQL Client Tools للإدارة المباشرة

https://www.postgresql.org/download/windows/ (فقط لو عايز تدير قاعدة البيانات بأداة رسومية زي pgAdmin).

---

## تشغيل المشروع (الملفات جاهزة بالفعل)

### الخطوة 1: فك ضغط المشروع

فك ضغط الملف المضغوط اللي معاك في أي مكان، مثلاً:
```
C:\Users\YourName\Desktop\mobile-accessories-erp
```

### الخطوة 2: تثبيت Dependencies الرئيسية

افتح Terminal/PowerShell داخل مجلد المشروع:
```bash
cd mobile-accessories-erp
npm install
```

### الخطوة 3: إعداد ملف البيئة (.env)

ملف `.env` موجود بالفعل بقيم افتراضية جاهزة للتطوير المحلي (منسوخ من `.env.example`).
لو عايز تغيّر كلمات السر أو الـ ports، عدّل `.env` مباشرة.

### الخطوة 4: تثبيت Dependencies للـ API

```bash
cd apps/api
npm install
cd ../..
```

### الخطوة 5: تثبيت Dependencies للـ Desktop App

```bash
cd apps/desktop
npm install
cd ../..
```

> **ملاحظة:** مجلد `apps/desktop/src-tauri` يحتوي على `tauri.conf.json` جاهز، لكن ملفات Rust الأساسية (`Cargo.toml`, `src/main.rs`, الأيقونات) بيتم توليدها تلقائياً أول مرة تشغّل فيها:
> ```bash
> cd apps/desktop
> npx tauri init
> ```
> لو سألك أسئلة، جاوب:
> - App name: `ERP System`
> - Window title: `ERP System`
> - Web assets location: `../dist`
> - Dev server URL: `http://localhost:5173`
> - Frontend dev command: `npm run dev`
> - Frontend build command: `npm run build`

### الخطوة 6: بدء Docker Containers

```bash
# من المجلد الرئيسي للمشروع
docker-compose up -d
docker ps
```
يجب أن تشوف 3 containers شغالة: `erp-postgres`, `erp-redis`, `erp-minio`.

### الخطوة 7: التحقق من PostgreSQL

```bash
docker exec -it erp-postgres psql -U erp_user -d erp_db
\l
\q
```

### الخطوة 8: تشغيل API

```bash
cd apps/api
npm run dev
```
انتظر رسالة:
```
🚀 Application is running on: http://localhost:3000
📚 API Documentation: http://localhost:3000/api/docs
```

افتح المتصفح على `http://localhost:3000/api/docs` للتأكد من عمل الـ Swagger.

### الخطوة 9: تشغيل Migrations و Seed

```bash
cd apps/api
npm run build
npm run db:migrate:prod
npm run db:seed:prod
```

**قبل تشغيل الـ seed لازم يكون في ملف `.env` عندك:**
```
JWT_MASTER_SECRET=اي-نص-عشوائي-32-حرف-على-الاقل-ومختلف-عن-باقي-المفاتيح
MASTER_ADMIN_EMAIL=you@example.com
MASTER_ADMIN_PASSWORD=كلمة-مرور-قوية-12-حرف-على-الاقل
```
(القيم الافتراضية موجودة في `.env.example` — غيّرها قبل التشغيل الحقيقي).

هيتعمل حساب **المدير العام** أول مرة بس. دخوله من نفس تطبيق الويب على `/admin/login`.

### الخطوة 10: تشغيل Desktop App

```bash
cd apps/desktop
npm run tauri dev
```
أول مرة هياخد وقت طويل (Rust build) — بعدها هيفتح تطبيق Desktop تلقائياً.

---

## تشغيل سريع (بعد أول إعداد)

**Windows:** دبل كليك على `start.bat` في المجلد الرئيسي.
**Linux/macOS:** `./start.sh`

**لإيقاف كل حاجة:**
**Windows:** `stop.bat` — **Linux/macOS:** `./stop.sh`

أو ببساطة استخدم سكريبت الإعداد الكامل أول مرة:
```bash
chmod +x scripts/setup.sh   # Linux/macOS فقط
./scripts/setup.sh
```

---

## استكشاف الأخطاء (Troubleshooting)

### Docker لا يعمل
تأكد إن Docker Desktop شغال وانتظر "Docker Desktop is running"، ثم `docker ps`.

### Port 5432 مستخدم
لو عندك PostgreSQL محلي شغال، إما أوقفه أو غيّر البورت في `.env` و `docker-compose.yml` (مثلاً `5433:5432`).

### npm install فشل
```bash
rm -rf node_modules package-lock.json   # (Windows: rmdir /s /q node_modules && del package-lock.json)
npm install
```

### Tauri build فشل
تأكد من:
1. `rustc --version` يعمل
2. تثبيت Visual Studio Build Tools (Desktop C++)
3. جرب: `cd apps/desktop && cargo clean && npm run tauri dev`

### API لا يتصل بقاعدة البيانات
1. `docker ps` — تأكد إن `erp-postgres` شغال
2. تأكد من `DATABASE_URL` في `.env`
3. جرب الاتصال يدوياً: `docker exec -it erp-postgres psql -U erp_user -d erp_db`

---

## الخطوات القادمة بعد نجاح التشغيل

1. اتبع خطة المراحل في `docs/PROJECT_STATUS.md`
2. ابدأ بتنفيذ Phase 1 (Foundation) ثم Phase 2 (Auth & Multi-Tenancy) وهكذا
3. استخدم `docs/DATABASE.md` و `docs/API.md` كمرجع أثناء بناء كل موديول
4. راجع `docs/SECURITY.md` قبل نشر أي شيء على بيئة إنتاج فعلية

بالتوفيق! 🚀
