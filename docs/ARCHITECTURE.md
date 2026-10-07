# بنية النظام الحالية

## نظرة عامة

النظام Web-first ERP/POS متعدد المستأجرين، ويتكون من:

- `apps/web`: واجهة React للمستخدمين وMaster Admin.
- `apps/api`: Backend NestJS على شكل Modular Monolith.
- `packages/shared`: الأنواع والأدوات المشتركة.
- PostgreSQL: مصدر البيانات الأساسي.

النظام الحالي Online، وأي طلبات بيع أو مخزون تتم من خلال الـ API وقاعدة البيانات المركزية.

## الطبقات

### واجهة المستخدم

- React + TypeScript + Vite.
- Tailwind CSS مع RTL.
- React Router مع تحميل الصفحات عند الحاجة.
- React Query مخصص لبيانات الخادم عند استخدامه، وContext للهوية والصلاحيات والإعدادات.
- Master Admin موجود داخل Web App تحت `/admin`.

### Backend

- NestJS.
- API versioning تحت `/api/v1`.
- TypeORM وPostgreSQL.
- JWT Access/Refresh Tokens.
- أدوار وصلاحيات مفروضة على الـ Backend.
- Feature Gates لكل تاجر.
- Audit Logging للعمليات الإدارية.

### قاعدة البيانات

- PostgreSQL هو المصدر الوحيد للحقيقة.
- كل سجل خاص بتاجر يحتوي على `tenant_id`.
- كل Service يستقبل `tenantId` من المستخدم المصادق عليه، وليس من Body الطلب.
- كل الاستعلامات الخاصة بالتاجر يجب أن تحتوي على Tenant Scope.
- Migrations هي المصدر الوحيد لتغيير Schema، و`synchronize` مغلق.

## عزل التجار

تسلسل الطلب المحمي:

```text
Bearer Token
    ↓
JwtStrategy يتحقق من المستخدم والتاجر والجلسة
    ↓
TenantContextGuard يستخرج tenantId من المستخدم
    ↓
PermissionGuard يتحقق من صلاحية العملية
    ↓
Service ينفذ استعلامًا مقيدًا بـ tenantId
```

قواعد مهمة:

1. لا يتم قبول `tenantId` من Body أو Query لتنفيذ عملية تاجر.
2. لا يتم إرجاع سجل إلا إذا كان `id` و`tenantId` متطابقين.
3. يتم فحص ملكية المنتج والمخزن والعميل والمورد قبل الحركة المالية أو المخزنية.
4. يتم رفض أي اختلاف بين Tenant الموجود في التوكن وTenant المستخدم.
5. كل تغيير في Role أو Session ينعكس على الطلبات الجديدة.

## الصلاحيات

الصلاحيات على شكل `resource.action`، مثل:

```text
products.view
products.create
inventory.adjust
sales.create
sales.return
reports.view
```

- `RequirePermission` يحدد الصلاحية المطلوبة.
- `PermissionGuard` يمنع الطلب من الـ Backend.
- الصلاحيات لا تعتمد على إخفاء الزر في الواجهة.
- يتم تحميل Roles وPermissions الحالية من قاعدة البيانات مع كل طلب JWT، لذلك إزالة الصلاحية لا تنتظر انتهاء التوكن.
- أول مستخدم للتاجر يحصل على Role باسم `owner` بصلاحيات الإدارة الكاملة، ويتم عمل Backfill للمستخدمين الحاليين بدون Role.

## العمليات المالية والمخزون

المبيعات والمشتريات والمرتجعات تستخدم Transaction واحدة عندما تحتوي العملية على أكثر من تغيير:

```text
Invoice
    + Invoice Items
    + Payment records
    + Inventory movement
    + Customer/Supplier balance
```

إذا فشل جزء، يتم Rollback للعملية كلها.

المخزون يستخدم:

- Transaction Database.
- Row locking.
- Advisory lock لمفتاح المنتج والمخزن.
- منع الكمية السالبة.
- التحقق من ملكية المنتج والمخزن للتاجر.
- حركة مخزون دائمة مع `balance_after`.

أرقام الفواتير تستخدم جدول `document_counters` بدل `COUNT(*) + 1` حتى لا تتكرر عند الطلبات المتزامنة.

المرتجعات:

- لا تتجاوز الكمية المتبقية من كل صنف.
- تعيد الكمية إلى المخزون داخل نفس Transaction.
- تعدل تكلفة وأرقام الربحية.
- لا تنشئ رصيدًا سالبًا للعميل بسبب فاتورة مدفوعة؛ رد المبلغ المدفوع يجب أن يكون عملية مالية منفصلة.

## الأداء

- Compression وHelmet على الـ API.
- Connection Pool مضبوط لقاعدة البيانات.
- Pagination وحد أقصى للصفحات في القوائم الأساسية.
- Indexes على Tenant والتواريخ والمفاتيح المستخدمة في البحث.
- Lazy loading لصفحات Web حتى لا يتم تحميل كل النظام مع صفحة الدخول.
- البحث في POS يستخدم debounce.
- Redis وMinIO موجودان كبنية توسع مستقبلية، لكن النظام الحالي لا يعتمد عليهما لتشغيله.

## القرارات التشغيلية

- Web App هو الواجهة الوحيدة للمستخدم النهائي.
- لا توجد طبقة تخزين محلية أو مسار مزامنة منفصل.
