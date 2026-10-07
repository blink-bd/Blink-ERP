# ERP/POS System for Mobile Accessories

نظام ERP/POS متعدد المستأجرين (Multi-Tenant) متخصص في تجارة إكسسوارات الموبايلات، ويعمل كـ Web App من المتصفح.

## المميزات الحالية

- ✅ بنية Multi-Tenant مع عزل بيانات على مستوى التطبيق وقواعد بيانات داعمة.
- ✅ نظام صلاحيات Roles وPermissions على الـ Backend.
- ✅ نظام إدارة ميزات Feature Flags لكل تاجر.
- ✅ هوية بصرية مخصصة White-Label.
- ✅ دعم عربي RTL مع بنية i18n قابلة للتوسع.
- ✅ إدارة المنتجات والتصنيفات والعلامات التجارية.
- ✅ إدارة المخزون والمخازن وحركات المخزون.
- ✅ POS ومبيعات ومشتريات ومرتجعات.
- ✅ إدارة العملاء والموردين والأرصدة.
- ✅ تقارير وMaster Admin.

## Tech Stack

**Backend:** NestJS · TypeScript · PostgreSQL · TypeORM · Docker

**Frontend:** React · TypeScript · Vite · Tailwind CSS · TanStack Query · React Hook Form · Zod

## البدء السريع

راجع [دليل التشغيل المحلي](./docs/INSTALL_GUIDE.md).

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

## بنية المشروع

```text
.
├── apps/
│   ├── api/              # NestJS backend
│   ├── web/              # Web application للتجار وMaster Admin
├── packages/
│   └── shared/           # Shared types and utilities
├── infra/                # PostgreSQL infrastructure
├── docs/                 # التوثيق
└── scripts/              # سكريبتات مساعدة
```

## التوثيق

- [البنية المعمارية](./docs/ARCHITECTURE.md)
- [تصميم قاعدة البيانات](./docs/DATABASE.md)
- [توثيق الـ API](./docs/API.md)
- [إرشادات الأمان](./docs/SECURITY.md)
- [نظام الميزات](./docs/FEATURE_SYSTEM.md)
- [نظام الهوية التجارية](./docs/BRANDING_SYSTEM.md)
- [نظام الترجمة](./docs/I18N_SYSTEM.md)
- [خطة التنفيذ والحالة](./docs/PROJECT_STATUS.md)
- [دليل التشغيل المحلي](./docs/INSTALL_GUIDE.md)
- [دليل نشر Web App](./docs/DEPLOYMENT.md)

## ملاحظات مهمة

- يجب تشغيل اختبارات الأمان والتكامل قبل الاستخدام التجاري واسع النطاق.

## الرخصة

UNLICENSED - Proprietary software
