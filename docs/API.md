# API Specification

## API Design Principles

1. **RESTful**: Follow REST conventions
2. **Versioned**: `/api/v1/...`
3. **Tenant-Scoped**: All endpoints automatically scoped to authenticated tenant
4. **Consistent**: Uniform response structure
5. **Documented**: OpenAPI/Swagger documentation
6. **Secure**: Authentication + Authorization on all endpoints
7. **Paginated**: Large lists support pagination
8. **Filterable**: Support query parameters for filtering
9. **Sortable**: Support sorting by common fields
10. **Validated**: Input validation on all endpoints

---

## Base URL

- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://api.yourdomain.com/api/v1`

---

## Authentication

### Login
`tenantId` في الـ query **اختياري**: لو البريد مسجل في متجر واحد نشط يتم تحديد المتجر تلقائياً،
ولو مسجل في أكثر من متجر يلزم إرسال `tenantId` وإلا يُرجع 400 مع رسالة توضح ذلك.

```http
POST /auth/login?tenantId=tenant-uuid
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response 200:
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "محمد أحمد",
      "tenantId": "tenant-uuid",
      "roles": ["cashier"],
      "permissions": ["sales.create", "sales.view"]
    },
    "tenant": {
      "id": "tenant-uuid",
      "businessName": "متجر الإكسسوارات",
      "currency": "SAR",
      "timezone": "Asia/Riyadh",
      "language": "ar"
    },
    "features": ["pos", "sales", "inventory", "customers"],
    "branding": {
      "appName": "نظام نقاط البيع",
      "logoUrl": "/uploads/tenants/xxx/logo.png",
      "primaryColor": "#0858A2",
      "secondaryColor": "#123456"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "uuid"
  },
  "message": "تم تسجيل الدخول بنجاح"
}

Response 401:
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "البريد الإلكتروني أو كلمة المرور غير صحيحة"
  }
}
```

### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{ "refreshToken": "uuid" }

Response 200:
{
  "success": true,
  "data": { "accessToken": "eyJhbGc...", "refreshToken": "new-uuid" }
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer {accessToken}

Response 200:
{ "success": true, "message": "تم تسجيل الخروج بنجاح" }
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer {accessToken}

Response 200:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "محمد أحمد",
    "phone": "+966500000000",
    "tenantId": "tenant-uuid",
    "branchId": "branch-uuid",
    "warehouseId": "warehouse-uuid",
    "roles": [{ "id": "role-uuid", "name": "cashier", "nameAr": "أمين الصندوق" }],
    "permissions": ["sales.create", "sales.view", "customers.view"],
    "isActive": true,
    "lastLoginAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Response Structure

### Success Response
```json
{ "success": true, "data": {}, "message": "عملية ناجحة", "meta": {} }
```

### Error Response
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "رسالة الخطأ", "details": {} } }
```

### Paginated Response
```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8, "hasNext": true, "hasPrev": false }
}
```

---

## Common Query Parameters

- Pagination: `?page=1&limit=20`
- Sorting: `?sortBy=createdAt&sortOrder=desc`
- Filtering: `?status=active&categoryId=uuid`
- Search: `?search=إكسسوار`
- Date Range: `?startDate=2024-01-01&endDate=2024-01-31`

---

## Products API

### List Products
```http
GET /products
Authorization: Bearer {accessToken}

Query Parameters:
- page, limit, search, categoryId, brandId, isActive
- sortBy: name|createdAt|price
- sortOrder: asc|desc

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "كفر أيفون 14 برو",
      "sku": "IP14P-CASE-001",
      "barcode": "1234567890123",
      "categoryId": "uuid",
      "category": { "id": "uuid", "name": "كفرات" },
      "brandId": "uuid",
      "brand": { "id": "uuid", "name": "Apple" },
      "costPrice": 15.00,
      "sellingPrice": 35.00,
      "wholesalePrice": 28.00,
      "stockLevel": 45,
      "minStockLevel": 10,
      "isLowStock": false,
      "imageUrl": "/uploads/products/xxx.jpg",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

### Get Product by ID
```http
GET /products/:id
Authorization: Bearer {accessToken}

Response 200: { "success": true, "data": { ...full product with inventory, variants... } }
Response 404: { "success": false, "error": { "code": "PRODUCT_NOT_FOUND", "message": "المنتج غير موجود" } }
```

### Search Product by Barcode/SKU
```http
GET /products/search/:code
Authorization: Bearer {accessToken}

Response 200:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "كفر أيفون 14 برو",
    "sku": "IP14P-CASE-001",
    "barcode": "1234567890123",
    "sellingPrice": 35.00,
    "availableQuantity": 42,
    "imageUrl": "/uploads/products/xxx.jpg"
  }
}
```

### Create Product
```http
POST /products
Authorization: Bearer {accessToken}
Permissions Required: products.create

{
  "name": "كفر أيفون 14 برو",
  "sku": "IP14P-CASE-001",
  "barcode": "1234567890123",
  "categoryId": "uuid",
  "brandId": "uuid",
  "costPrice": 15.00,
  "sellingPrice": 35.00,
  "taxRate": 15.00,
  "trackInventory": true,
  "minStockLevel": 10,
  "unit": "piece"
}

Response 201: { "success": true, "data": {...}, "message": "تم إضافة المنتج بنجاح" }
Response 409: { "success": false, "error": { "code": "DUPLICATE_SKU", "message": "رمز المنتج موجود مسبقاً" } }
```

### Update Product
```http
PUT /products/:id
Permissions Required: products.update
Response 200: { "success": true, "data": {...}, "message": "تم تحديث المنتج بنجاح" }
```

### Resolve Product Price Review (مراجعة التسعير)
```http
POST /products/:id/price-review
Permissions Required: products.update
{ "costChoice": "previous | new", "sellingPrice": 200.00, "wholesalePrice": 180.00, "halfWholesalePrice": 190.00 }
```
- ينفع فقط لما يكون على المنتج تنبيه مراجعة تسعير مفتوح (`needsPriceReview = true`)، وإلا `400`.
- `previous` = التكلفة المسجلة قبل فاتورة الشراء، `new` = التكلفة اللي نزل بيها المورد. التكلفة المختارة بتتحط في `costPrice`.
- `sellingPrice` لازم يكون أكبر من التكلفة المختارة، ونفس الشرط على الجملة ونصف الجملة لو اتبعتوا. `halfWholesalePrice` محتاج ميزة `half_wholesale_pricing`.
- بعد الحفظ يتقفل التنبيه وتتفضّى خانات المراجعة (`priceReviewPreviousCost` / `priceReviewNewCost` / `priceReviewPurchaseNumber` / `priceReviewAt`).

### Delete Product
```http
DELETE /products/:id
Permissions Required: products.delete
Response 200: { "success": true, "message": "تم حذف المنتج بنجاح" }
Response 409: { "success": false, "error": { "code": "PRODUCT_HAS_TRANSACTIONS", "message": "لا يمكن حذف المنتج لوجود حركات مخزنية عليه" } }
```

### Upload Product Image
```http
POST /products/:id/image
Content-Type: multipart/form-data
Form Data: image: file (jpg, png, max 2MB)
Response 200: { "success": true, "data": { "imageUrl": "/uploads/products/xxx.jpg" } }
```

---

## Sales API

### Create Sale (POS)
```http
POST /sales
Permissions Required: sales.create
Feature Required: pos

{
  "customerId": "uuid",
  "warehouseId": "uuid",
  "saleDate": "2024-01-15T14:30:00Z",
  "items": [
    { "productId": "uuid", "quantity": 2, "unitPrice": 35.00, "discountAmount": 0, "taxRate": 15.00 }
  ],
  "discountAmount": 10.00,
  "payments": [{ "methodId": "cash-method-uuid", "amount": 100.00 }],
  "notes": "ملاحظات الفاتورة"
}

Response 201: { "success": true, "data": {...full sale with items, totals, cogs...}, "message": "تم إنشاء الفاتورة بنجاح" }

Response 400:
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "الكمية المتاحة غير كافية",
    "details": { "productId": "uuid", "productName": "كفر أيفون 14 برو", "requestedQuantity": 10, "availableQuantity": 5 }
  }
}
```

### List Sales
```http
GET /sales
Permissions Required: sales.view
Query Parameters: page, limit, search, customerId, startDate, endDate, status, paymentStatus, branchId, createdBy
```

### Get Sale Details
```http
GET /sales/:id
Permissions Required: sales.view
```

### Add Payment to Sale
```http
POST /sales/:id/payments
Permissions Required: sales.create
{ "methodId": "uuid", "amount": 26.50, "paymentDate": "2024-01-16T10:00:00Z", "referenceNumber": "TXN123456" }
```

### Return Sale
```http
POST /sales/:id/return
Permissions Required: sales.return
Feature Required: returns
{ "returnDate": "2024-01-16T11:00:00Z", "items": [{ "saleItemId": "uuid", "quantity": 1, "reason": "معيب" }], "refundAmount": 35.00 }
```

### Return Item Disposition (فحص المرتجع)
```http
POST /sales/returns/:returnId/items/:itemId/disposition
Permissions Required: sales.return
Feature Required: return_disposition
{ "disposition": "original | supplier | restocked | write_off", "supplierId": "uuid", "repairExpense": 25.00, "repairDescription": "تغيير شاشة", "wasteExpense": 10.00, "product": { "name": "موبايل مرتجع", "sku": "RT-1", "costPrice": 80, "sellingPrice": 110 } }
```
- `original`: الصنف سليم — يرجع المخزن على نفس الصنف بتكلفته الأصلية.
- `supplier`: يُعاد للمورد ويخفض رصيده بقيمة `unitCost × quantity` (يتطلب `supplierId`).
- `restocked`: يدخل المخزن كصنف مستقل جديد (يتطلب `product` برمز أو باركود). لو تكلفته الجديدة أقل من الأصلية يُسجل الفرق هالكاً تلقائياً.
- `write_off`: **هالك/إتلاف كامل** — تخرج الكمية من المخزون وتُسجل خسارة بقيمة `unitCost × quantity` في خطوة واحدة. لا يُنشأ صنف جديد، ويرفض الطلب (400) لو أُدخل `wasteExpense` أو `repairExpense` لأن الخسارة تُحسب تلقائياً.
- `repairExpense` يُسجل فاتورة صيانة داخلية عند تفعيل `maintenance_management` وإلا مصروفاً. `wasteExpense` يُسجل دائماً مصروف «صيانة وهالك المرتجعات».

### Void Sale
```http
POST /sales/:id/void
Permissions Required: sales.delete
{ "reason": "خطأ في الإدخال" }
Response 400: { "success": false, "error": { "code": "CANNOT_VOID_PAID_SALE", "message": "لا يمكن إلغاء فاتورة تم الدفع عليها" } }
```

---

## Customers API

### List / Get / Create Customers
```http
GET /customers                (Permissions: customers.view)
GET /customers/:id             (Permissions: customers.view)
POST /customers                (Permissions: customers.create)
GET /customers/:id/statement   (Permissions: customers.view)
```

Statement response includes opening balance, transactions (debit/credit), and closing balance.

---

## Inventory API

```http
GET /inventory                          (Permissions: inventory.view, Feature: inventory)
GET /inventory/transactions             (Permissions: inventory.view)
POST /inventory/adjust                  (Permissions: inventory.adjust)
POST /inventory/transfer                (Permissions: inventory.adjust, Feature: warehouses)
```

---

## Reports API

كل التقارير بتاخد `startDate` و`endDate` بصيغة `YYYY-MM-DD`، والتقسيم لأيام وساعات بيتحسب بالمنطقة الزمنية بتاعة التاجر (`tenants.timezone`).

```http
GET /reports/sales            (Permission: reports.view, Feature: reports)
GET /reports/inventory        (Permission: reports.view, Feature: reports)
GET /reports/purchases        (Permission: reports.view, Feature: reports)
GET /reports/expenses         (Permission: reports.view, Feature: reports)
GET /reports/profit-loss      (Permission: advanced_reports.view, Feature: advanced_reports)
```

### Advanced Reports (Feature: `advanced_reports`, Permission: `advanced_reports.view`)
```http
GET /reports/advanced/product-profitability   ربحية كل منتج (إيراد، تكلفة، هامش)
GET /reports/advanced/by-cashier              مبيعات كل كاشير
GET /reports/advanced/by-payment-method       توزيع طرق الدفع
GET /reports/advanced/inventory-valuation     قيمة المخزون بالتكلفة وبسعر البيع لكل مخزن
GET /reports/advanced/dead-stock?days=60      أصناف راكدة لم تُبع منذ N يوم
GET /reports/advanced/sales-heatmap           مبيعات حسب اليوم × الساعة -> { timezone, cells[] }
GET /reports/advanced/top-customers           أعلى العملاء شراءً
```

---

## Users & Roles API

```http
GET    /users/me
GET    /users                        (users.view)    -> { users[], limits: { maxUsers, current } }
POST   /users                        (users.create)  -> بيطبق maxUsers وقاعدة "مفيش صلاحيات أعلى من صلاحياتك"
PUT    /users/:id                    (users.update)
POST   /users/:id/reset-password     (users.update)  10 req/min
POST   /users/:id/revoke-sessions    (users.update)  -> بيزود sessionVersion
DELETE /users/:id                    (users.delete)  -> آخر مالك نشط محمي
GET    /roles                        (users.view | roles.manage)
GET    /roles/permissions            (roles.manage)
POST   /roles | PUT /roles/:id | DELETE /roles/:id   (roles.manage)
POST   /auth/change-password         { currentPassword, newPassword }  5 req/min, لا يقبل API key
```

---

## API Keys (Feature: `api_access`, Permission: `api_keys.manage`)

```http
GET    /api-keys        -> { data: [...], meta: { grantablePermissions } }
POST   /api-keys        { name, permissions[], expiresAt? } -> data.key يظهر مرة واحدة فقط
DELETE /api-keys/:id    إلغاء فوري
```

استخدام المفتاح: `X-API-Key: blk_live_...` أو `Authorization: Bearer blk_live_...`.
الصلاحية الفعلية = صلاحيات المفتاح ∩ صلاحيات منشئه الحالية. مسارات المستخدمين والأدوار والمفاتيح والاستيراد والتصدير وتغيير الباسورد مقفولة على المفاتيح.

---

## Data Import / Export (Feature: `import_export`)

```http
GET  /data/entities                          (data.import | data.export) الكيانات والأعمدة
GET  /data/template/:entity                  (data.import)  قالب CSV فاضي
GET  /data/export/:entity                    (data.export)  CSV بـ UTF-8 BOM، 10 req/min
POST /data/import/:entity?dryRun=true|false  (data.import)  multipart "file"، 5MB / 5000 صف، 10 req/min
```

`entity` ∈ `products` | `customers` | `suppliers`. المطابقة مع السجلات الموجودة: المنتجات بـ SKU ثم الباركود، والعملاء والموردين بالموبايل.
الاستيراد كل-أو-لا-شيء: لو فيه صف واحد فيه خطأ مفيش حاجة بتتكتب. الرد:
`{ dryRun, applied, summary: { totalRows, valid, toCreate, toUpdate, created, updated, failed }, errors: [{ row, field?, message }] }`.
استيراد منتجات جديدة بيتفحص قدام `maxProducts`.

---

## Cash Register API

```http
POST /cash-register/shifts               (open shift)
POST /cash-register/shifts/:id/close     (close shift)
GET  /cash-register/shifts/current
POST /cash-register/transactions         (cash in/out)
```

---

## Master Admin API

### Auth (`/admin/auth`)
```http
POST /admin/auth/login            { email, password, otp? }   5 req/min
                                  -> 401 OTP_REQUIRED لو 2FA مفعلة ومفيش otp، و401 OTP_INVALID لو غلط
GET  /admin/auth/me
POST /admin/auth/change-password  { currentPassword, newPassword }
POST /admin/auth/logout-all       يبطل كل الجلسات
POST /admin/auth/2fa/setup        { password } -> { secret, otpauthUrl }
POST /admin/auth/2fa/enable       { otp }
POST /admin/auth/2fa/disable      { password, otp }
```
فشل إعادة التحقق (باسورد حالي أو OTP غلط في العمليات دي) بيرجع **403**.

### Tenants
```http
GET    /admin/tenants
GET    /admin/tenants/:id
POST   /admin/tenants            { businessName, ..., country?, currency?, timezone?, adminUser: {...} }
PUT    /admin/tenants/:id        أي حقل من فوق ماعدا adminUser
PATCH  /admin/tenants/:id/status        { isActive }
PUT    /admin/tenants/:id/subscription  { subscriptionPrice, subscriptionCycle, subscriptionNote, subscriptionEndsAt }
PUT    /admin/tenants/:id/limits        { maxUsers?, maxBranches?, maxWarehouses?, maxProducts? }  (null = بدون حد)
GET    /admin/tenants/:id/usage
       -> { usage: { users, activeUsers, branches, warehouses, products, activeApiKeys, failedLogins24h },
            limits: { maxUsers, maxBranches, maxWarehouses, maxProducts } }
GET    /admin/tenants/:id/features
PUT    /admin/tenants/:id/features      { features: [{ featureId, isEnabled }] }  الاعتماديات بتتفعل تلقائياً
GET    /admin/tenants/:id/branches
POST   /admin/tenants/:id/branches                  { name, code?, phone? }  إنشاء فرع للتاجر
PUT    /admin/tenants/:id/branches/:branchId
GET    /admin/tenants/:id/warehouses
POST   /admin/tenants/:id/warehouses                { name, branchId? }      إنشاء مخزن وربطه بفرع
PUT    /admin/tenants/:id/warehouses/:warehouseId   { branchId?, name?, isActive? }
POST   /admin/tenants/:id/warehouses/:warehouseId/branches  { branchId }     فرع يستخدم مخزن موجود (مشترك)
DELETE /admin/tenants/:id/warehouses/:warehouseId/branches/:branchId         فك ربط فرع مشترك
GET    /admin/tenants/:id/users
POST   /admin/tenants/:id/reset-user-password
GET    /admin/tenants/:id/audit-logs
GET    /admin/tenants/:id/backup        نسخة JSON (بدون هاشات أو أسرار)
POST   /admin/tenants/restore
DELETE /admin/tenants/:id               { businessName } للتأكيد
```

إنشاء الفروع والمخازن وربطها (بما فيها المخازن المشتركة بين الفروع) متاح للمدير العام فقط من
المسارات أعلاه؛ التاجر يستهلك الفروع والمخازن الموجودة في البيع والشراء والتحويلات.

`GET /api/v1/maintenance/:id/share` (Feature: `maintenance.share`) يرجع بيانات إرسال فاتورة الصيانة
للعميل: رقم الفاتورة والتاريخ وبيانات العميل ورقم الواتساب و`servicePrice` و`message` جاهزة.
الرد لا يحتوي على `partsCost` أو `profit`، والرسالة تعرض إيراد الخدمة بمسمى «تكلفة الصيانة».

الإعدادات الإقليمية:
- `timezone`: اسم IANA صحيح (`Africa/Cairo`، `Asia/Riyadh`، …). أي قيمة تانية بترجع 400.
- `currency`: كود ISO من 3 حروف كبيرة (`EGP`، `SAR`، …).
- الافتراضي للتجار الجدد `Egypt` / `EGP` / `Africa/Cairo`.

### Platform
```http
GET /admin/dashboard
GET /admin/plans
GET /admin/features
GET /admin/audit-logs     ?action=&tenantId=&page=&limit=
```

---

## Error Codes

### Authentication Errors
- `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `TENANT_SUSPENDED`, `SUBSCRIPTION_EXPIRED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`

### Authorization Errors
- `FORBIDDEN`, `FEATURE_DISABLED`, `PERMISSION_DENIED`
- `LIMIT_REACHED`: وصلت لحد في الباقة. فيه حقل `limit` بيحدد الحد (`maxProducts` …)
- `OTP_REQUIRED`, `OTP_INVALID`: المصادقة الثنائية للمدير العام

شكل الخطأ: `{ "success": false, "error": { "code", "message", ...extra, "timestamp", "path" } }`.

### Validation Errors
- `VALIDATION_ERROR`, `REQUIRED_FIELD`, `INVALID_FORMAT`, `INVALID_VALUE`

### Business Logic Errors
- `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `INSUFFICIENT_STOCK`, `PRODUCT_NOT_FOUND`, `CUSTOMER_NOT_FOUND`,
  `SALE_NOT_FOUND`, `CANNOT_DELETE_HAS_TRANSACTIONS`, `SHIFT_ALREADY_OPEN`, `NO_OPEN_SHIFT`, `INVALID_PAYMENT_AMOUNT`

### System Errors
- `INTERNAL_SERVER_ERROR`, `DATABASE_ERROR`, `FILE_UPLOAD_ERROR`

---

## Rate Limiting

- General: `THROTTLE_LIMIT` requests/minute per IP (default 300)
- Tenant login: 10/min · refresh: 30/min · change-password: 5/min
- Master admin login / password / 2FA: 5/min
- Data import / export, user password reset: 10/min

```http
HTTP 429 Too Many Requests
Retry-After: 60

{ "success": false, "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "تم تجاوز عدد الطلبات المسموح بها. حاول مجدداً بعد 60 ثانية" } }
```

---

## Webhooks (Future Feature)

Events: `sale.created`, `sale.updated`, `sale.voided`, `payment.received`, `inventory.low_stock`, `shift.opened`, `shift.closed`

```json
{ "event": "sale.created", "tenantId": "uuid", "timestamp": "2024-01-15T14:30:00Z", "data": {} }
```

---

## API Versioning

- Current version: `v1`
- API path: `/api/v1/...`
- Deprecation notice: 6 months before removing old version
- Multiple versions supported simultaneously during transition

---

## OpenAPI Documentation

- Development: `http://localhost:3000/api/docs`
- Production: `https://api.yourdomain.com/api/docs`
