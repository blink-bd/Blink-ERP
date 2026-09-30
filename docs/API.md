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
```http
POST /auth/login
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

```http
GET /reports/sales            (Permissions: reports.view, Feature: reports)
GET /reports/inventory        (Permissions: reports.view)
GET /reports/profit-loss      (Permissions: reports.view, Feature: advanced_reports)
GET /reports/:reportType/export  (Permissions: reports.export)  -> format: pdf|xlsx|csv
```

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

```http
GET    /admin/tenants
POST   /admin/tenants
PUT    /admin/tenants/:id
PUT    /admin/tenants/:id/features
PUT    /admin/tenants/:id/branding
GET    /admin/tenants/:id/activity
```

---

## Synchronization API

```http
POST /sync/sales
GET  /sync/status
```

Sync requests use `deviceId` + `idempotencyKey` for safe retries, and process operations (`create`/`update`/`delete`) against server entities.

---

## Error Codes

### Authentication Errors
- `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `TENANT_SUSPENDED`, `SUBSCRIPTION_EXPIRED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`

### Authorization Errors
- `FORBIDDEN`, `FEATURE_NOT_ENABLED`, `PERMISSION_DENIED`

### Validation Errors
- `VALIDATION_ERROR`, `REQUIRED_FIELD`, `INVALID_FORMAT`, `INVALID_VALUE`

### Business Logic Errors
- `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `INSUFFICIENT_STOCK`, `PRODUCT_NOT_FOUND`, `CUSTOMER_NOT_FOUND`,
  `SALE_NOT_FOUND`, `CANNOT_DELETE_HAS_TRANSACTIONS`, `SHIFT_ALREADY_OPEN`, `NO_OPEN_SHIFT`, `INVALID_PAYMENT_AMOUNT`

### System Errors
- `INTERNAL_SERVER_ERROR`, `DATABASE_ERROR`, `FILE_UPLOAD_ERROR`, `SYNC_ERROR`

---

## Rate Limiting

- General endpoints: 100 requests/minute per user
- Login endpoint: 5 requests/minute per IP
- Search endpoints: 50 requests/minute per user
- Report exports: 10 requests/minute per user

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
