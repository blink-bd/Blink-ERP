# ERP/POS System for Mobile Accessories

نظام ERP/POS متعدد المستأجرين لتجارة إكسسوارات الموبايلات، يعمل كتطبيق ويب من المتصفح.

## المميزات

- Multi-Tenant مع عزل بيانات وصلاحيات Roles وPermissions على الـ Backend.
- إدارة الميزات لكل تاجر وهوية بصرية مخصصة، مع دعم عربي RTL.
- إدارة المنتجات والمخزون والمخازن والفروع، وتحويلات مخزون لا تُنفذ إلا بعد موافقة.
- نقطة بيع ومبيعات ومشتريات ومرتجعات، مع إدارة العملاء والموردين والأرصدة.
- تقارير تشغيلية ومتقدمة وتقارير لفروع منفردة أو لمجموعة فروع مختارة.
- مصادقة عبر HttpOnly Cookies وحماية CSRF، مع تنبيهات البريد وWhatsApp وWebhooks.
- إيصال إلكتروني برابط تحقق وQR، ومرفقات للفواتير، ونسخ PostgreSQL احتياطي خارجي.

## Tech Stack

- API: NestJS, TypeORM, PostgreSQL, Redis
- Web: React, Vite, TypeScript, Tailwind CSS
- Monorepo: npm workspaces

## البدء السريع

راجع [دليل التشغيل المحلي](./docs/INSTALL_GUIDE.md). لإعداد الويب والاستضافة راجع [دليل نشر Web App](./docs/DEPLOYMENT.md) و[دليل إعداد Web App خطوة بخطوة](./docs/WEBAPP_SETUP_GUIDE.md).

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

## التوثيق

- [تصميم قاعدة البيانات](./docs/DATABASE.md)
- [توثيق API](./docs/API.md)
- [إرشادات الأمان](./docs/SECURITY.md)
- [نظام الميزات](./docs/FEATURE_SYSTEM.md)
- [نظام الهوية التجارية](./docs/BRANDING_SYSTEM.md)
- [نظام الترجمة](./docs/I18N_SYSTEM.md)
- [سجل تعديلات المرحلة الثانية](./docs/CHANGELOG_PHASE2.md)
- [سجل تعديلات المرحلة الثالثة — فرع العمل وصلاحيات الفروع والمخازن](./docs/CHANGELOG_PHASE3_BRANCHES.md)
- [تشغيل Cookies والتنبيهات والتحويلات وWebhooks والنسخ الاحتياطي والإيصال الإلكتروني](./docs/OPERATIONS_FEATURES.md)
- [حالة المشروع وخطة التنفيذ](./docs/PROJECT_STATUS.md)

## ملاحظات

شغّل اختبارات الأمان والتكامل قبل الاستخدام التجاري واسع النطاق، وراجع إعدادات البيئة والأسرار قبل النشر.
