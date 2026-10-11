# Security Guidelines

## Overview
This document outlines security best practices and requirements for the ERP/POS system. Security is implemented at multiple layers: network, application, database, and data.

---

## الضوابط المطبّقة فعلياً (الحالة الحالية للكود)

> القسم ده بيوصف اللي متنفذ ومتختبر في الكود (`apps/api/test/smoke/security-smoke.mjs` — 83 فحص E2E).
> باقي المستند إرشادات عامة.

### 1. حساب المدير العام (Master Admin)
| الضابط | التفاصيل |
|---|---|
| المصادقة الثنائية TOTP | `POST /admin/auth/2fa/setup` ← `2fa/enable` ← `2fa/disable`. السر مشفّر AES-256-GCM بمفتاح `MASTER_2FA_ENCRYPTION_KEY`، ورمز الـ OTP مايتستخدمش مرتين (replay protection عبر `totp_last_step`). |
| قفل الحساب | 5 محاولات فاشلة ← قفل 30 دقيقة، وكل محاولة بتتسجل في سجل التدقيق. |
| تحديد معدل الطلبات | 5 طلبات/دقيقة على الدخول وتغيير الباسورد و2FA. |
| قائمة IPs مسموحة | `MASTER_ADMIN_ALLOWED_IPS` (IPs أو CIDR مفصولين بفاصلة). أي طلب للوحة من IP تاني بيترفض حتى لو التوكن صحيح. لازم `TRUST_PROXY_HOPS` يكون مظبوط عشان الـ IP الحقيقي يتقري صح. |
| إبطال الجلسات | `sessionVersion` في التوكن؛ تغيير الباسورد أو `POST /admin/auth/logout-all` أو تفعيل/إلغاء 2FA بيبطل كل التوكنات القديمة فوراً. |
| إعادة التحقق | العمليات الحساسة (تغيير الباسورد، 2FA، حذف تاجر يتطلب كتابة اسمه) بتطلب الباسورد الحالي؛ الفشل بيرجع **403** (مش 401 عشان الواجهة ماتعملش logout). |
| الطوارئ | `MASTER_ADMIN_RESET_PASSWORD=true` أو `MASTER_ADMIN_RESET_2FA=true` مرة واحدة ثم Redeploy ثم **احذف المتغير فوراً**. ده محتاج وصول لإعدادات السيرفر، فمش متاح لمهاجم من بره. |

### 2. مستخدمي التاجر
- الباسورد Argon2id، وسياسة قوة: 8–128 حرف + كبير + صغير + رقم + رمز.
- قفل 30 دقيقة بعد 5 محاولات فاشلة، و`sessionVersion` لإبطال الجلسات عند تغيير الباسورد أو تعطيل المستخدم أو تغيير دوره.
- منع تصعيد الصلاحيات: محدش يقدر يدي دور فيه صلاحيات أكتر من اللي معاه، المالك بس اللي يدير المُلّاك، وآخر مالك نشط مايتحذفش ولا يتعطل.
- حدود الباقة (`maxUsers`، `maxBranches`، `maxWarehouses`، `maxProducts`) بتتطبق على السيرفر، ومش بتعتمد على الواجهة.

### 3. عزل التاجر (Multi-tenancy)
- كل استعلام مقيّد بـ `tenant_id` المأخوذ من التوكن، مش من الطلب. الـ IDs المرسلة في الـ body (فرع، مخزن، قسم، ماركة، دور) بيتأكد إنها تبع نفس التاجر.
- `stripProtected()` بتشيل `tenantId`/`id`/`createdBy`… من أي body قبل الحفظ (mass-assignment).
- التاجر الموقوف أو اللي اشتراكه منتهي: التوكنات بترفض فوراً.
- الميزات المدفوعة (`@RequireFeature`) بتتفحص على السيرفر وبترجع `403 FEATURE_DISABLED`.

### 4. مفاتيح الـ API
- الصيغة `blk_live_…`؛ المخزّن هو SHA-256 بس، والمفتاح بيظهر مرة واحدة عند الإنشاء.
- الصلاحية الفعلية = صلاحيات المفتاح ∩ صلاحيات منشئه الحالية ∩ الصلاحيات المسموح منحها. لو المنشئ اتعطل أو قلّت صلاحياته، المفتاح بيتقيد تلقائياً.
- المسارات الحساسة (المستخدمين، الأدوار، تغيير الباسورد، المفاتيح نفسها، الاستيراد والتصدير) عليها `@NoApiKey`.
- محتاج ميزة `api_access` مفعلة للتاجر.

### 5. البيانات والملفات
- **حقن صيغ CSV:** أي خلية تبدأ بـ `= + - @ Tab CR` بتتصدّر بـ `'` قدامها عشان Excel مايشغلهاش.
- الاستيراد كل-أو-لا-شيء، بنفس قواعد تحقق الـ API، وفيه dry-run. الحد 5MB و5000 صف.
- النسخ الاحتياطية للتاجر بتشيل هاشات الباسورد وأسرار 2FA.
- **XSS في الطباعة:** كل بيانات الفاتورة والملصقات بتعدي على `escapeHtml` قبل ما تتحط في نافذة الطباعة.

### 6. البنية التحتية
- Helmet (CSP، HSTS، frameguard…)، وCORS مقيّد بـ `FRONTEND_URL` (يقبل أكثر من رابط مفصولين بفاصلة).
- تحديد معدل عام `THROTTLE_LIMIT` لكل IP في الدقيقة (الافتراضي 300).
- Swagger مقفول في الإنتاج.
- `env.validation` بيوقف التشغيل لو أسرار JWT ضعيفة (أقل من 32 حرف) أو متكررة، أو لو `MASTER_2FA_ENCRYPTION_KEY` ناقص في الإنتاج.
- Docker Compose بيربط Postgres وRedis على `127.0.0.1` بس.
- **تسجيل SQL مقفول افتراضياً** (`DB_LOGGING=true` للتشخيص المؤقت بس، لأنه بيطبع بيانات حساسة في اللوجز).
- **SSL لقاعدة البيانات:**

  | المتغير | التأثير |
  |---|---|
  | (افتراضي في الإنتاج) | SSL بدون تحقق من الشهادة، للتوافق مع Render/Supabase |
  | `DB_SSL_CA="-----BEGIN CERTIFICATE-----\n…"` | تحقق كامل من شهادة السيرفر (**موصى به**) |
  | `DB_SSL_REJECT_UNAUTHORIZED=true` | تحقق باستخدام شهادات النظام |
  | `DB_SSL=false` | بدون SSL (شبكة خاصة فقط) |

### 7. سجل التدقيق
كل دخول (ناجح أو فاشل أو مقفول)، وتغيير صلاحيات، وتفعيل ميزات، وتعديل حدود، وتعديل بيانات تاجر، وإنشاء أو إلغاء مفتاح API، واستيراد، وتصدير، ونسخ احتياطي، وحذف بيتسجل في `audit_logs` بالـ IP والـ User-Agent والقيم قبل وبعد. المدير العام بيشوفه من `/admin/security`، وكل تاجر من صفحة تفاصيله.

### ✅ قائمة الإطلاق في الإنتاج
1. فعّل المصادقة الثنائية لحساب المدير العام فوراً بعد أول دخول.
2. اضبط `MASTER_ADMIN_ALLOWED_IPS` على IP مكتبك أو الـ VPN.
3. غيّر باسورد المدير الافتراضي، وماتسيبش `MASTER_ADMIN_RESET_*` مفعّلة.
4. أي قيمة في `.env` فيها `#` لازم تتحط بين علامتي تنصيص: `MASTER_ADMIN_PASSWORD="Abc#123..."`.
5. أسرار JWT و`MASTER_2FA_ENCRYPTION_KEY` عشوائية (48 بايت أو أكتر): `openssl rand -base64 48`. **ماتغيرش** `MASTER_2FA_ENCRYPTION_KEY` بعد تفعيل 2FA، وإلا لازم تعمل reset.
6. `TRUST_PROXY_HOPS` = عدد البروكسيات قدام التطبيق (Render = 1، وCloudflare + Render = 2).
7. يفضّل `DB_SSL_CA` بشهادة مزوّد قاعدة البيانات.
8. راجع صفحة الأمان في لوحة المدير أسبوعياً (محاولات الدخول الفاشلة، والمفاتيح النشطة).

---

## Authentication Security

### Password Requirements
- Minimum length: 8 characters
- At least one uppercase, one lowercase, one number, one special character

### Password Storage
```typescript
import * as argon2 from 'argon2';

const hashConfig = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, hashConfig);
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```

### Account Lockout
```typescript
class AccountLockoutService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MINUTES = 30;

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    user.failedLoginAttempts += 1;
    user.lastFailedLoginAt = new Date();

    if (user.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await this.auditLogger.log({ action: 'ACCOUNT_LOCKED', userId: user.id });
      await this.notificationService.send({ to: user.email, template: 'account-locked', data: { unlockTime: user.lockedUntil } });
    }
    await this.usersRepository.save(user);
  }
}
```

---

## JWT Token Security

### Token Configuration
```typescript
const JWT_CONFIG = {
  accessToken: { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' as const },
  refreshToken: { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d', algorithm: 'HS256' as const },
};

interface JWTPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}
```

Access tokens are short-lived (15m); refresh tokens are stored hashed in DB for revocation capability. Tenant status and subscription are checked on every request validation.

---

## Multi-Tenant Security

### Tenant Isolation Enforcement

#### Database Level
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON products
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
SET LOCAL app.current_tenant_id = '{tenant_id}';
```

#### Application Level
```typescript
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Tenant context required');
    }
    request.tenantId = user.tenantId;
    return true;
  }
}
```

#### Never accept tenant_id from client
```typescript
// ❌ WRONG
@Post('products')
async createProduct(@Body() dto: CreateProductDto) {
  return this.productsService.create(dto);
}

// ✅ CORRECT
@Post('products')
async createProduct(@Body() dto: CreateProductDto, @Request() req) {
  return this.productsService.create({ ...dto, tenantId: req.tenantId });
}
```

### Testing Tenant Isolation
Comprehensive tests must verify: cross-tenant read is blocked (404), tenant_id injection in create is ignored (uses JWT tenant), and list endpoints never leak other tenants' data.

---

## Input Validation

### DTO Validation
```typescript
export class CreateProductDto {
  @IsString() @Length(1, 500) @Transform(({ value }) => value?.trim())
  name: string;

  @IsNumber() @Min(0)
  costPrice: number;

  @IsNumber() @Min(0.01)
  sellingPrice: number;
}
```

### SQL Injection Prevention
Always use parameterized queries via QueryBuilder / TypeORM repositories; never concatenate user input into raw SQL.

### XSS Prevention
Use DOMPurify to sanitize any HTML content before storage/rendering; escape plain text for display.

---

## File Upload Security

- Validate MIME type AND actual file content (magic numbers)
- Enforce max file size (2MB for logos, 5MB for backgrounds)
- Store with UUID filenames under `tenants/{tenantId}/{category}/`
- Never trust the client-provided extension alone

---

## Rate Limiting

```typescript
ThrottlerModule.forRoot({ ttl: 60, limit: 100 });

@Throttle(5, 60) // login: 5 req/min
@Post('login')
async login(@Body() dto: LoginDto) { return this.authService.login(dto); }
```

---

## Audit Logging

Every entity change (create/update/delete) and every sensitive action (login, logout, permission change, feature toggle) must be recorded in `audit_logs` with actor, IP, user agent, old/new values, and severity.

---

## HTTPS/TLS

Production must terminate TLS 1.2/1.3 at Nginx/Caddy with HSTS, and forward security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

---

## Environment Variables Security

Never commit `.env`. Validate required env vars on startup and fail fast if missing (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).

---

## Database Security

- Use SSL connections in production
- Principle of least privilege for the application DB user (no CREATE/DROP rights beyond migrations user)

---

## Dependency Security

- Run `npm audit` regularly
- Pin exact versions in production
- Review new dependencies before adding

---

## Security Headers

```typescript
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

---

## Incident Response

1. Detection — monitor audit logs, alert on anomalies
2. Containment — disable accounts, revoke tokens, block IPs
3. Investigation — review logs, identify scope
4. Recovery — patch, reset credentials, restore backups
5. Post-Incident — document, update policies, notify affected users

---

## Security Checklist

### Development
- [ ] Env vars for secrets
- [ ] Input validation everywhere
- [ ] Parameterized queries
- [ ] No sensitive data in logs
- [ ] HTTPS everywhere

### Authentication
- [ ] Strong password policy
- [ ] Argon2 hashing
- [ ] Account lockout
- [ ] Short-lived access tokens
- [ ] Secure refresh token storage + revocation

### Authorization
- [ ] Tenant isolation enforced
- [ ] Permissions checked on every endpoint
- [ ] Feature flags checked
- [ ] Never trust client-side data

### Data Protection
- [ ] TLS in transit
- [ ] Encrypted backups
- [ ] Secure file uploads
- [ ] Sanitized user content

### Monitoring
- [ ] Comprehensive audit logging
- [ ] Failed login monitoring
- [ ] Alerting on anomalies
- [ ] Regular security reviews

### Dependencies
- [ ] Regular updates
- [ ] Vulnerability scanning
- [ ] Lock files committed
