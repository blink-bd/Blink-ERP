# ERP/POS System for Mobile Accessories

نظام ERP/POS متعدد المستأجرين (Multi-Tenant) متخصص في تجارة إكسسوارات الموبايلات.

## المميزات

- ✅ بنية Multi-Tenant بعزل بيانات كامل
- ✅ نظام إدارة ميزات (Feature Flags) لكل تاجر
- ✅ هوية بصرية مخصصة (White-Label)
- ✅ دعم عربي RTL كامل مع جاهزية للإنجليزية
- ✅ تطبيق Desktop (Tauri)
- ✅ نقطة بيع تعمل Offline مع مزامنة
- ✅ إدارة مخزون شاملة
- ✅ متابعة مبيعات ومشتريات
- ✅ إدارة عملاء وموردين
- ✅ تقارير وتحليلات متقدمة

## Tech Stack

**Backend:** NestJS · TypeScript · PostgreSQL · TypeORM · Redis · Docker
**Frontend:** Tauri (Desktop) · React · TypeScript · Tailwind CSS · TanStack Query · Zustand

## البدء السريع

راجع **[docs/INSTALL_GUIDE.md](./docs/INSTALL_GUIDE.md)** للتشغيل المحلي (Desktop) خطوة بخطوة.

راجع **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** لو عايز تنشر النظام كـ **Web App** على الإنترنت (GitHub + Render + Vercel) بحيث أي حد يفتحه من المتصفح بلينك.

ملخص سريع:
```bash
npm install
cd apps/api && npm install && cd ../..
cd apps/desktop && npm install && cd ../..
docker-compose up -d
cd apps/api && npm run dev
# في نافذة تانية:
cd apps/desktop && npm run tauri dev
```

أو استخدم `start.bat` (Windows) / `./start.sh` (Linux/macOS) بعد أول إعداد.

## بنية المشروع

```
.
├── apps/
│   ├── api/              # NestJS backend
│   ├── desktop/          # Tauri desktop app (تطبيق سطح مكتب)
│   ├── web/              # نفس التطبيق كـ Web App عادي (بدون Tauri) — للنشر على Vercel/Netlify
│   └── admin/            # Master admin web app (مستقبلي)
├── packages/
│   └── shared/           # Shared types
├── infra/
│   └── postgres/         # PostgreSQL init scripts
├── docs/                 # كل التوثيق المعماري + دليل التسطيب + دليل النشر
├── render.yaml           # وصف خدمات النشر التلقائي على Render (API + قاعدة بيانات)
└── scripts/               # سكريبتات مساعدة
```

## التوثيق الكامل

- [البنية المعمارية](./docs/ARCHITECTURE.md)
- [تصميم قاعدة البيانات](./docs/DATABASE.md)
- [توثيق الـ API](./docs/API.md)
- [إرشادات الأمان](./docs/SECURITY.md)
- [نظام إدارة الميزات](./docs/FEATURE_SYSTEM.md)
- [نظام الهوية التجارية](./docs/BRANDING_SYSTEM.md)
- [نظام الترجمة](./docs/I18N_SYSTEM.md)
- **[سجل تعديلات المرحلة 2 — تنفيذ طلبات التاجر الـ11](./docs/CHANGELOG_PHASE2.md)** ⭐ أحدث تحديث
- [خطة المراحل ومتتبع الحالة](./docs/PROJECT_STATUS.md)
- [دليل التسطيب الكامل (Desktop)](./docs/INSTALL_GUIDE.md)
- **[دليل تسطيب Web App خطوة بخطوة (GitHub + Supabase + Render + Cloudflare)](./docs/WEBAPP_SETUP_GUIDE.md)** ⭐ ابدأ من هنا للنشر أونلاين
- [دليل نشر بديل (Render + Vercel)](./docs/DEPLOYMENT.md)
- [ملاحظات إضافية (Supabase + Cloudflare)](./docs/DEPLOY_SUPABASE_CLOUDFLARE.md)

## حالة الكود المرفق

هذه الحزمة تحتوي على:
- ✅ بنية Monorepo كاملة وقابلة للتشغيل (npm workspaces + turbo)
- ✅ Backend NestJS شغّال فعلياً: `AuthModule`, `TenantsModule`, `UsersModule` مع JWT + Argon2 + Guards + Migrations + Seeds
- ✅ Desktop App React + Tauri شغّال فعلياً: Login, Dashboard, Auth/Features/Branding Contexts, i18n عربي RTL
- ✅ Docker Compose (PostgreSQL, Redis, MinIO)
- 🔲 باقي الموديولات (Products, Inventory, Sales, POS, Reports...) موصوفة بالكامل في `docs/` وجاهزة للتنفيذ حسب خطة `docs/PROJECT_STATUS.md`

## الرخصة

UNLICENSED - Proprietary software
