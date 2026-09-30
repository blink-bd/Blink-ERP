# Security Guidelines

## Overview
This document outlines security best practices and requirements for the ERP/POS system. Security is implemented at multiple layers: network, application, database, and data.

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
