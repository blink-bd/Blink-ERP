# Changelog

## [Unreleased]

### Added
- محرك الميزات: الاعتماديات (pos→sales …)، وتطبيق كل الميزات المدفوعة على السيرفر (`403 FEATURE_DISABLED`)
- المدير العام: مصادقة ثنائية TOTP، وقائمة IPs مسموحة، وقفل الحساب، و`logout-all`، وصفحة الأمان وسجل التدقيق
- حدود الباقة: `maxUsers`، `maxBranches`، `maxWarehouses`، `maxProducts` + لوحة الاستخدام لكل تاجر
- إدارة المستخدمين والأدوار مع منع تصعيد الصلاحيات
- مفاتيح API (`blk_live_`) بصلاحيات محدودة
- استيراد وتصدير CSV للمنتجات والعملاء والموردين (dry-run، حماية من حقن الصيغ)
- 7 تقارير متقدمة + خريطة المبيعات بالمنطقة الزمنية للتاجر
- سعر نص الجملة في نقطة البيع، وتطبيق تسعيرة العميل المحفوظة تلقائياً، وطباعة ملصقات باركود بالجملة
- الإعدادات الإقليمية للتاجر (منطقة زمنية، عملة، دولة)، والافتراضي مصر / جنيه / القاهرة

### Security
- تسجيل SQL بقى اختياري (`DB_LOGGING`)، وخيارات تحقق SSL لقاعدة البيانات (`DB_SSL_CA`)
- النسخ الاحتياطية بدون هاشات أو أسرار، وescape لكل الطباعة (XSS)
- تحقق من متغيرات البيئة عند التشغيل

### Fixed
- تقرير الأرباح والخسائر (المرتجعات والتكلفة)
- عدّاد محاولات الدخول الفاشلة

### Added
- Initial project scaffolding (monorepo, Docker, configs)
- Backend: TenantsModule, UsersModule, AuthModule (JWT + Argon2 + Guards)
- Database: initial migrations (tenants, users, permissions/roles) + permissions seed
- Full architecture, database, API, security, feature-system, branding-system, i18n and install documentation

## [1.0.0] - TBD
### Added
- First production release
