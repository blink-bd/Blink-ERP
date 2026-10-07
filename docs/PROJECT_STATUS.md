# حالة المشروع الحالية

## معلومات عامة

- **النوع:** Web ERP/POS متعدد المستأجرين.
- **Backend:** NestJS Modular Monolith.
- **Frontend:** React + Vite Web App.
- **Database:** PostgreSQL.
- **اللغة الأساسية:** عربي RTL.
- **الحالة:** النظام يعمل كقاعدة قوية، ويحتاج QA واختبارات تكامل قبل الاستخدام التجاري واسع النطاق.

## المنفذ حاليًا

- ✅ Monorepo باستخدام npm workspaces وTurborepo.
- ✅ API versioning وValidation وHelmet وCompression وRate Limiting.
- ✅ JWT Authentication مع Argon2.
- ✅ Tenant Context والتحقق من تطابق المستخدم مع التاجر.
- ✅ Roles وPermissions على مستوى الـ Backend.
- ✅ Backfill لدور Owner للتجار الحاليين.
- ✅ Feature Flags.
- ✅ Master Admin داخل Web App.
- ✅ Branding وRTL وi18n foundation.
- ✅ المنتجات والتصنيفات والعلامات التجارية.
- ✅ المخازن والفروع والمخزون وحركات المخزون.
- ✅ المبيعات والمدفوعات والمرتجعات.
- ✅ المشتريات والموردون والعملاء والأرصدة.
- ✅ المصروفات والخزينة والتقارير.
- ✅ Atomic financial workflows للمبيعات والمشتريات والمرتجعات.
- ✅ Document counters لمنع تكرار أرقام المستندات.
- ✅ Lazy loading وتحسين Responsive Layout في Web.

## يحتاج إلى استكمال

- 🟡 اختبارات Unit حقيقية للـ Services والـ Guards.
- 🟡 اختبارات Integration لعزل التجار والصلاحيات.
- 🟡 اختبارات Concurrency للمخزون وأرقام المستندات.
- 🟡 اختبارات E2E لرحلة البيع والمرتجع والشراء.
- 🟡 DTOs إضافية لبعض نماذج الإدارة البسيطة.
- 🟡 Pagination مرئي كامل في كل الجداول الكبيرة.
- 🟡 Export PDF/Excel وطباعة الإيصالات.
- 🟡 Monitoring وTracing وHealth Checks في بيئة الإنتاج.
- 🟡 إضافة lockfile وCI pipeline ثابتة.
- 🟡 مراجعة Dependency vulnerabilities وتحديث الحزم تدريجيًا.

## الأولوية قبل الإنتاج

1. تشغيل migrations على نسخة قاعدة بيانات تجريبية.
2. اختبار أن كل Role يرى ويعدل ما يسمح به فقط.
3. اختبار أن أي Tenant لا يستطيع قراءة أو تعديل Tenant آخر.
4. اختبار فشل منتصف عملية البيع والتأكد أن المخزون والرصيد يعودان كما كانا.
5. اختبار مرتجعات جزئية ومتعددة لنفس الصنف.
6. اختبار طلبين متزامنين على نفس المخزون.
7. اختبار الضغط على التقارير والقوائم.
8. تنفيذ QA للـ Web على الهاتف والتابلت والكمبيوتر.

## التشغيل

راجع [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) للتشغيل المحلي، و[DEPLOYMENT.md](./DEPLOYMENT.md) للنشر.
