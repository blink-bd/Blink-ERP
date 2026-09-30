# System Architecture Documentation

## نظرة عامة على النظام

### System Type
Multi-Tenant SaaS ERP/POS Platform متخصص في تجارة إكسسوارات الموبايلات

### Core Principles
1. **Multi-Tenancy First**: عزل كامل بين البيانات والصلاحيات
2. **Feature-Driven**: نظام إدارة خدمات ديناميكي
3. **White-Label Ready**: هوية مخصصة لكل تاجر
4. **I18n from Day 1**: عربي RTL أولاً مع استعداد للإنجليزية
5. **Offline-First POS**: عمل محلي مع مزامنة مركزية
6. **Security by Design**: أمان على جميع الطبقات
7. **Zero Vendor Lock-in**: اعتماد على Open Source فقط

---

## System Architecture Layers

### 1. Presentation Layer

#### Desktop Application (Primary)
- **Technology**: Tauri + React + TypeScript + Vite
- **Local Database**: SQLite
- **Purpose**:
  - POS operations (offline-capable)
  - Inventory management
  - Sales & purchases
  - Local caching
  - Sync queue management

#### Master Admin Web Application
- **Technology**: React + TypeScript + Vite
- **Purpose**:
  - Tenant management
  - Feature management
  - Branding configuration
  - Subscription management
  - System monitoring

#### Tenant Admin Web Application
- **Technology**: React + TypeScript + Vite (shared codebase)
- **Purpose**:
  - Business management
  - Reports
  - Configuration
  - User management

---

### 2. API Layer

#### Main API (NestJS)
- **Architecture**: Modular Monolith
- **Database**: PostgreSQL
- **Authentication**: JWT with Refresh Tokens
- **Authorization**: RBAC + Feature Gates

#### API Modules Structure
```
auth/                 # Authentication & session management
tenants/              # Tenant CRUD & configuration
users/                # User management
roles/                # Role management
permissions/          # Permission management
features/             # Feature flag management
plans/                # Subscription plans
branding/             # White-label configuration
products/             # Product catalog
categories/           # Product categorization
brands/               # Brand management
inventory/            # Stock management
warehouses/           # Warehouse operations
branches/              # Branch management
suppliers/             # Supplier management
customers/             # Customer management
purchases/             # Purchase orders & receiving
sales/                 # Sales transactions
returns/               # Return management
payments/              # Payment processing
expenses/              # Expense tracking
cash-register/         # Shift management
reports/               # Business intelligence
notifications/         # Alert system
audit/                 # Audit logging
settings/              # System configuration
sync/                  # Offline synchronization
files/                 # File management
```

---

### 3. Data Layer

#### PostgreSQL (Source of Truth)
- **Purpose**: Central persistent storage
- **Features**:
  - Row-Level Security (RLS) for tenant isolation
  - Audit triggers
  - Proper indexing strategy
  - Foreign key constraints
  - Transaction support

#### SQLite (Local Cache)
- **Purpose**: Offline operations
- **Scope**: Desktop application only
- **Synchronization**: Bidirectional with conflict resolution
- **Tables**: Subset of central database + sync metadata

---

## Multi-Tenancy Strategy

### Tenant Identification Flow

```
User Login
    ↓
Extract Credentials
    ↓
Authenticate User
    ↓
Identify Tenant (from user.tenant_id)
    ↓
Load Tenant Context
    ↓
Generate JWT with tenant_id claim
    ↓
All subsequent requests scoped by tenant_id from token
```

### Tenant Isolation Mechanisms

#### 1. Database Level
```sql
-- Every tenant-scoped table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- other fields
    CONSTRAINT products_tenant_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);

-- Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON products
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

#### 2. Application Level
```typescript
// Tenant Context Guard
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context required');
    }

    // Set tenant context for database queries
    request.tenantId = tenantId;
    return true;
  }
}

// Repository Base Class
export abstract class TenantScopedRepository<T> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly request: REQUEST
  ) {}

  private getTenantId(): string {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context not set');
    }
    return tenantId;
  }

  async findAll(options?: FindOptions): Promise<T[]> {
    return this.repository.find({
      where: { tenantId: this.getTenantId(), ...options?.where },
      ...options
    });
  }

  // Similar pattern for all CRUD operations
}
```

#### 3. API Level
```typescript
// All tenant-scoped endpoints must use guard
@Controller('products')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ProductsController {
  // tenant_id automatically injected from JWT
  // No way to override from client
}
```

---

## Feature Management System

### Feature Definition

```typescript
interface Feature {
  id: string;                    // e.g., 'pos', 'inventory', 'advanced_reports'
  name: string;                  // Localization key
  description: string;           // Localization key
  category: FeatureCategory;     // 'core', 'sales', 'inventory', 'reports', etc.
  dependencies: string[];        // Required features
  isDefault: boolean;            // Enabled by default for new tenants
  requiresPlan: boolean;         // Must be part of a paid plan
}

interface TenantFeature {
  id: string;
  tenantId: string;
  featureId: string;
  enabled: boolean;
  enabledAt: Date;
  enabledBy: string;             // Admin user ID
  metadata: Record<string, any>; // Feature-specific config
}
```

### Feature Gate Architecture

```typescript
// 1. Decorator for Controllers
@FeatureGuard('inventory')
@Controller('inventory')
export class InventoryController {}

// 2. Guard Implementation
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureId = this.reflector.get<string>('feature', context.getHandler());
    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId;

    const hasFeature = await this.featuresService.tenantHasFeature(
      tenantId,
      featureId
    );

    if (!hasFeature) {
      throw new ForbiddenException(
        `Feature '${featureId}' not enabled for this tenant`
      );
    }

    return true;
  }
}

// 3. Frontend Feature Provider
const FeatureContext = createContext<Set<string>>(new Set());

export const useFeature = (featureId: string): boolean => {
  const features = useContext(FeatureContext);
  return features.has(featureId);
};

// 4. Component Usage
const InventoryPage = () => {
  const hasInventory = useFeature('inventory');

  if (!hasInventory) {
    return <Navigate to="/forbidden" />;
  }

  return <InventoryManagement />;
};
```

### Dynamic Navigation Building

```typescript
interface NavigationItem {
  id: string;
  labelKey: string;              // i18n key
  icon: string;
  path?: string;
  feature?: string;              // Required feature
  permission?: string;           // Required permission
  children?: NavigationItem[];
}

const navigationConfig: NavigationItem[] = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: 'dashboard',
    path: '/dashboard',
  },
  {
    id: 'sales',
    labelKey: 'nav.sales',
    icon: 'sales',
    feature: 'sales',
    children: [
      {
        id: 'pos',
        labelKey: 'nav.pos',
        icon: 'pos',
        path: '/pos',
        feature: 'pos',
        permission: 'sales.create',
      },
      {
        id: 'invoices',
        labelKey: 'nav.invoices',
        icon: 'invoice',
        path: '/sales/invoices',
        feature: 'sales',
        permission: 'sales.view',
      },
    ],
  },
  // ... more items
];

// Filter navigation based on features and permissions
function buildNavigation(
  config: NavigationItem[],
  features: Set<string>,
  permissions: Set<string>
): NavigationItem[] {
  return config
    .filter(item => {
      if (item.feature && !features.has(item.feature)) return false;
      if (item.permission && !permissions.has(item.permission)) return false;
      return true;
    })
    .map(item => ({
      ...item,
      children: item.children
        ? buildNavigation(item.children, features, permissions)
        : undefined,
    }))
    .filter(item => !item.children || item.children.length > 0);
}
```

---

## Permission System (RBAC)

### Permission Model

```typescript
interface Permission {
  id: string;
  resource: string;              // 'sales', 'products', 'inventory'
  action: string;                // 'view', 'create', 'update', 'delete'
  scope: 'own' | 'branch' | 'all'; // Data scope
  description: string;           // i18n key
}

// Naming convention: resource.action
// Examples:
// - sales.view
// - sales.create
// - products.update
// - inventory.delete
// - reports.export

interface Role {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  isSystem: boolean;             // Cannot be deleted
  permissions: string[];         // Permission IDs
}

interface UserRole {
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string;
}

// User can have additional permissions beyond roles
interface UserPermission {
  userId: string;
  permissionId: string;
  grantedAt: Date;
  grantedBy: string;
}
```

### Permission Gate Architecture

```typescript
// Combined Feature + Permission Guard
@Injectable()
export class AuthorizationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const requiredFeature = this.reflector.get<string>('feature', context.getHandler());
    const requiredPermission = this.reflector.get<string>('permission', context.getHandler());

    // Check 1: Feature enabled?
    if (requiredFeature) {
      const hasFeature = await this.featuresService.tenantHasFeature(
        request.tenantId,
        requiredFeature
      );
      if (!hasFeature) {
        throw new ForbiddenException('Feature not available');
      }
    }

    // Check 2: User has permission?
    if (requiredPermission) {
      const hasPermission = await this.permissionsService.userHasPermission(
        request.user.id,
        requiredPermission
      );
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }
}

// Usage
@Post()
@FeatureGuard('sales')
@RequirePermission('sales.create')
async createSale(@Body() dto: CreateSaleDto) {
  // Only reachable if:
  // 1. Tenant has 'sales' feature enabled
  // 2. User has 'sales.create' permission
}
```

---

## White-Label Branding System

### Branding Model

```typescript
interface TenantBranding {
  tenantId: string;

  // Identity
  appName: string;               // Custom app name
  businessName: string;
  businessNameAr: string;
  businessNameEn: string;

  // Logos
  logoUrl: string;               // Main logo
  logoLightUrl: string;          // For dark backgrounds
  logoDarkUrl: string;           // For light backgrounds
  faviconUrl: string;

  // Colors (CSS custom properties)
  colors: {
    primary: string;             // #0858A2
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    sidebar: string;
    header: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };

  // Typography
  fontFamily: string;
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
  };

  // Layout
  borderRadius: string;
  spacing: string;

  // Invoice Template
  invoiceTemplate: 'modern' | 'classic' | 'minimal';
  invoiceHeaderColor: string;
  invoiceShowLogo: boolean;

  // Login Page
  loginBackgroundUrl: string;
  loginBackgroundColor: string;
  loginPosition: 'left' | 'center' | 'right';

  // Custom CSS (validated and sanitized)
  customCss?: string;

  // Metadata
  updatedAt: Date;
  updatedBy: string;
}
```

### Theme Loading Flow

```typescript
// 1. After authentication, load tenant branding
async function loadTenantBranding(tenantId: string): Promise<TenantBranding> {
  const response = await api.get(`/tenants/${tenantId}/branding`);
  return response.data;
}

// 2. Apply theme to application
function applyTheme(branding: TenantBranding): void {
  const root = document.documentElement;

  // Apply colors as CSS variables
  Object.entries(branding.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });

  // Apply typography
  root.style.setProperty('--font-family', branding.fontFamily);

  // Update favicon
  updateFavicon(branding.faviconUrl);

  // Update page title
  document.title = branding.appName;
}

// 3. Theme Provider Component
const ThemeProvider: React.FC = ({ children }) => {
  const { tenant } = useTenant();
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    if (tenant?.id) {
      loadTenantBranding(tenant.id).then(setBranding);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (branding) {
      applyTheme(branding);
    }
  }, [branding]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
};
```

### Logo Management

```typescript
interface LogoUpload {
  file: File;
  type: 'main' | 'light' | 'dark' | 'favicon';
  tenantId: string;
}

// Validation
const LOGO_CONSTRAINTS = {
  main: {
    maxSize: 2 * 1024 * 1024,      // 2MB
    maxWidth: 500,
    maxHeight: 200,
    formats: ['image/png', 'image/jpeg', 'image/svg+xml'],
  },
  favicon: {
    maxSize: 100 * 1024,           // 100KB
    dimensions: '32x32 or 16x16',
    formats: ['image/x-icon', 'image/png'],
  },
};

async function uploadLogo(upload: LogoUpload): Promise<string> {
  // 1. Validate file size
  // 2. Validate file type
  // 3. Validate dimensions
  // 4. Generate unique filename: tenants/{tenantId}/logos/{type}-{timestamp}.ext
  // 5. Upload to storage (local filesystem or MinIO)
  // 6. Return URL
  // 7. Update tenant branding record
}
```

---

## Internationalization (i18n) System

### i18n Architecture

```typescript
// 1. Translation Structure
// locales/ar/common.json
{
  "common": {
    "save": "حفظ",
    "cancel": "إلغاء",
    "delete": "حذف",
    "edit": "تعديل",
    "search": "بحث",
    "add": "إضافة",
    "actions": "إجراءات",
    "loading": "جاري التحميل...",
    "noData": "لا توجد بيانات",
    "confirm": "تأكيد",
    "success": "تم بنجاح",
    "error": "حدث خطأ"
  },
  "nav": {
    "dashboard": "لوحة التحكم",
    "sales": "المبيعات",
    "pos": "نقطة البيع",
    "inventory": "المخزون",
    "products": "المنتجات",
    "customers": "العملاء",
    "suppliers": "الموردون",
    "reports": "التقارير",
    "settings": "الإعدادات"
  },
  "sales": {
    "title": "المبيعات",
    "create": "فاتورة جديدة",
    "invoice": "فاتورة",
    "customer": "العميل",
    "date": "التاريخ",
    "total": "الإجمالي",
    "paid": "المدفوع",
    "remaining": "المتبقي",
    "status": "الحالة"
  }
  // ... more
}
```

### i18n Implementation

```typescript
// Using react-i18next
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import arCommon from './locales/ar/common.json';
import arSales from './locales/ar/sales.json';
// ... more modules

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: {
        common: arCommon,
        sales: arSales,
        // ... more
      },
      // en: { ... } // Future
    },
    fallbackLng: 'ar',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// RTL/LTR handling
useEffect(() => {
  const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = i18n.language;
}, [i18n.language]);
```

---

## Offline Synchronization System

### Sync Architecture

```
Desktop App (SQLite)
        ↓
  Outbox Queue
        ↓
  Sync Engine
        ↓
   Backend API
        ↓
PostgreSQL (Source of Truth)
```

### Data Models

```typescript
// Sync metadata table (SQLite)
interface SyncMetadata {
  id: string;
  entityType: 'sale' | 'product' | 'customer' | 'payment' | 'expense';
  entityId: string;              // UUID
  operation: 'create' | 'update' | 'delete';
  payload: any;                  // Serialized entity
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  lastAttemptAt: Date | null;
  error: string | null;
  createdAt: Date;
  syncedAt: Date | null;
  idempotencyKey: string;        // UUID for deduplication
}
```

### Sync Flow

```typescript
async function createSaleOffline(sale: Sale): Promise<void> {
  const db = await getLocalDatabase();
  sale.id = uuidv4();
  sale.idempotencyKey = uuidv4();
  await db.insert('sales', sale);
  await db.insert('sync_metadata', {
    id: uuidv4(),
    entityType: 'sale',
    entityId: sale.id,
    operation: 'create',
    payload: sale,
    status: 'pending',
    attempts: 0,
    idempotencyKey: sale.idempotencyKey,
    createdAt: new Date(),
  });
}

async function syncPendingChanges(): Promise<void> {
  const db = await getLocalDatabase();
  const pending = await db.query(`
    SELECT * FROM sync_metadata
    WHERE status IN ('pending', 'failed')
    AND attempts < 3
    ORDER BY createdAt ASC
    LIMIT 10
  `);

  for (const item of pending) {
    try {
      await db.update('sync_metadata', item.id, { status: 'syncing', lastAttemptAt: new Date() });
      await api.post(`/sync/${item.entityType}`, {
        operation: item.operation,
        data: item.payload,
        idempotencyKey: item.idempotencyKey,
      });
      await db.update('sync_metadata', item.id, { status: 'synced', syncedAt: new Date() });
    } catch (error) {
      await db.update('sync_metadata', item.id, {
        status: 'failed',
        attempts: item.attempts + 1,
        error: error.message,
      });
    }
  }
}
```

### Conflict Resolution

```typescript
interface InventoryUpdate {
  productId: string;
  warehouseId: string;
  quantity: number;
  version: number;              // Optimistic locking
  updatedAt: Date;
}

async function updateInventory(update: InventoryUpdate) {
  const current = await this.inventoryRepository.findOne({
    productId: update.productId,
    warehouseId: update.warehouseId,
  });

  if (current.version !== update.version) {
    throw new ConflictException('Inventory changed by another user');
  }

  await this.inventoryRepository.update({
    ...update,
    version: current.version + 1,
  });
}
```

---

## Security Architecture

### Authentication Flow

```
1. User enters credentials
   ↓
2. POST /auth/login { email, password }
   ↓
3. Verify credentials
   ↓
4. Identify tenant from user.tenant_id
   ↓
5. Generate access token (JWT, 15 min)
   ↓
6. Generate refresh token (secure, httpOnly, 7 days)
   ↓
7. Return tokens + user data + tenant data
   ↓
8. Client stores access token in memory, refresh token in httpOnly cookie
   ↓
9. Subsequent requests include access token in Authorization header
   ↓
10. Token expires → use refresh token to get new access token
```

### Password Security

```typescript
import * as argon2 from 'argon2';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

---

## Performance Optimization

### Database Indexing Strategy

```sql
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_sales_tenant_id ON sales(tenant_id);
CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);

CREATE INDEX idx_sales_tenant_date ON sales(tenant_id, created_at DESC);
CREATE INDEX idx_products_tenant_category ON products(tenant_id, category_id);
CREATE INDEX idx_inventory_tenant_product_warehouse
  ON inventory(tenant_id, product_id, warehouse_id);

CREATE INDEX idx_products_name_gin ON products USING gin(to_tsvector('arabic', name));
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

CREATE UNIQUE INDEX idx_products_tenant_barcode ON products(tenant_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX idx_products_tenant_sku ON products(tenant_id, sku)
  WHERE sku IS NOT NULL;
```

### Caching Strategy

```typescript
@Injectable()
export class TenantConfigService {
  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    const cacheKey = `tenant:${tenantId}:config`;
    let config = await this.cacheManager.get<TenantConfig>(cacheKey);
    if (!config) {
      config = await this.tenantsRepository.getConfig(tenantId);
      await this.cacheManager.set(cacheKey, config, 3600);
    }
    return config;
  }
}
```

---

## Technology Stack Summary

### Frontend
- **Desktop**: Tauri + React + TypeScript + Vite
- **Web**: React + TypeScript + Vite
- **UI Library**: shadcn/ui + Tailwind CSS
- **State Management**: Zustand / TanStack Query
- **Forms**: React Hook Form + Zod
- **i18n**: react-i18next
- **Charts**: Recharts
- **Tables**: TanStack Table

### Backend
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **ORM**: TypeORM
- **Authentication**: Passport + JWT
- **Validation**: class-validator
- **API Documentation**: Swagger/OpenAPI

### Desktop Local Storage
- **Database**: SQLite
- **ORM**: TypeORM (same as backend for consistency)

### DevOps
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx or Caddy
- **CI/CD**: GitHub Actions
- **Testing**: Vitest + Playwright + Supertest

### File Storage
- **Development**: Local filesystem
- **Production**: MinIO (S3-compatible, self-hosted)

---

## Architecture Decision Records

### ADR-001: Multi-Tenant Strategy
**Decision**: Shared database with tenant_id column
**Rationale**: Simpler to manage, lower cost, easier cross-tenant analytics, RLS adds security layer.
**Consequences**: Must ensure tenant isolation at all levels; critical to test data leakage.

### ADR-002: Desktop Technology
**Decision**: Tauri instead of Electron
**Rationale**: Smaller bundle (~10MB vs ~150MB), better performance (Rust core), lower memory footprint.
**Consequences**: Smaller ecosystem, requires Rust toolchain.

### ADR-003: Monolith vs Microservices
**Decision**: Start with Modular Monolith
**Rationale**: Simpler deployment, easier local dev, lower complexity; extract to microservices later if needed.
**Consequences**: Must maintain clean module boundaries.

### ADR-004: Offline Sync Strategy
**Decision**: Local SQLite + Sync Queue + Idempotency
**Rationale**: POS must work offline; UUIDs client-side prevent ID conflicts; idempotency prevents duplicates.
**Consequences**: Conflict resolution complexity; sync queue requires monitoring.

### ADR-005: i18n from Day 1
**Decision**: Build with react-i18next from start, Arabic default
**Rationale**: Retrofitting i18n is painful; Arabic RTL has layout implications.
**Consequences**: All text must use translation keys.

---

## System Constraints

### Technical Constraints
1. Must support Windows 10+ for desktop app
2. Must work with PostgreSQL 15+
3. Must support SQLite for offline storage
4. Must handle RTL layouts

### Business Constraints
1. Zero cost for core dependencies
2. Must support multiple tenants on single installation
3. Must be white-labelable
4. Must support offline POS

### Performance Targets
1. POS barcode scan → product load: < 100ms
2. API response time (p95): < 500ms
3. Desktop app startup: < 3s
4. Sync operation (100 sales): < 5s
