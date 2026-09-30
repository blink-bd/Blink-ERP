# Feature Management System

## Overview
The Feature Management System is a core architectural component that enables dynamic control over what functionality is available to each tenant, enabling different service tiers as a flexible SaaS model.

---

## Core Concepts

### What is a Feature?
A functional capability or module (e.g. POS, Inventory, Advanced Reports, Multi-Branch, API Access) that can be independently enabled/disabled per tenant.

### Feature Characteristics
1. Granular
2. Independent
3. Hierarchical (dependencies)
4. Configurable (per-tenant config)
5. Auditable

---

## Feature Definition Schema

```sql
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  description TEXT,
  description_ar TEXT,
  category VARCHAR(50),
  module VARCHAR(50),
  depends_on UUID[],
  is_default BOOLEAN DEFAULT false,
  is_core BOOLEAN DEFAULT false,
  requires_plan BOOLEAN DEFAULT false,
  icon VARCHAR(50),
  color VARCHAR(7),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_beta BOOLEAN DEFAULT false,
  config_schema JSONB,
  limits_schema JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_features_code ON features(code);
CREATE INDEX idx_features_category ON features(category);
CREATE INDEX idx_features_active ON features(is_active);
```

### TypeScript Interface
```typescript
interface Feature {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  category: FeatureCategory;
  module: SystemModule;
  dependsOn: string[];
  isDefault: boolean;
  isCore: boolean;
  requiresPlan: boolean;
  isActive: boolean;
  isBeta: boolean;
  configSchema?: JSONSchema;
  limitsSchema?: JSONSchema;
}

enum FeatureCategory {
  CORE = 'core', SALES = 'sales', INVENTORY = 'inventory', PURCHASES = 'purchases',
  REPORTS = 'reports', ACCOUNTING = 'accounting', ADVANCED = 'advanced',
  INTEGRATIONS = 'integrations', TOOLS = 'tools',
}
```

---

## Tenant Feature Assignment

```sql
CREATE TABLE tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  limits JSONB DEFAULT '{}'::jsonb,
  trial_ends_at TIMESTAMP,
  expires_at TIMESTAMP,
  enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  enabled_by UUID,
  disabled_at TIMESTAMP,
  disabled_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_tenant_feature UNIQUE(tenant_id, feature_id)
);
```

---

## Feature Catalog (summary)

**Core (always on):** dashboard, users, settings

**Standard (default on):** pos, sales, products, inventory, customers, suppliers, purchases, returns, cash_register, expenses, reports

**Advanced/Premium (opt-in, requires plan):** advanced_reports, branches, warehouses, barcode_printing, import_export, api_access, custom_fields, automated_backups

Each has `nameAr`, `dependsOn`, `icon`, and optional `configSchema`/`limitsSchema` (e.g. `maxWarehouses`, `requestsPerHour`).

---

## Feature Resolution Logic

```typescript
@Injectable()
export class FeaturesService {
  async tenantHasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    const cacheKey = `tenant:${tenantId}:feature:${featureCode}`;
    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    const feature = await this.featuresRepository.findByCode(featureCode);
    if (!feature || !feature.isActive) { await this.cacheManager.set(cacheKey, false, 3600); return false; }
    if (feature.isCore) { await this.cacheManager.set(cacheKey, true, 3600); return true; }

    const tenantFeature = await this.tenantFeaturesRepository.findOne({ where: { tenantId, featureId: feature.id } });
    if (!tenantFeature || !tenantFeature.isEnabled) { await this.cacheManager.set(cacheKey, false, 3600); return false; }
    if (tenantFeature.expiresAt && tenantFeature.expiresAt < new Date()) { await this.cacheManager.set(cacheKey, false, 3600); return false; }

    if (feature.dependsOn?.length) {
      const dependencies = await this.featuresRepository.findByIds(feature.dependsOn);
      for (const dep of dependencies) {
        if (!(await this.tenantHasFeature(tenantId, dep.code))) {
          await this.cacheManager.set(cacheKey, false, 3600);
          return false;
        }
      }
    }

    await this.cacheManager.set(cacheKey, true, 3600);
    return true;
  }
}
```

---

## Feature Guards

### Backend
```typescript
export const RequireFeature = (featureCode: string) => SetMetadata('requiredFeature', featureCode);

@Injectable()
export class FeatureGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.get<string>('requiredFeature', context.getHandler())
      || this.reflector.get<string>('requiredFeature', context.getClass());
    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const hasFeature = await this.featuresService.tenantHasFeature(request.tenantId, requiredFeature);
    if (!hasFeature) throw new ForbiddenException(`Feature '${requiredFeature}' is not enabled for this tenant`);
    return true;
  }
}
```

### Frontend Hook
```typescript
export function useFeature(featureCode: string): boolean {
  const { features } = useContext(FeaturesContext);
  return features.has(featureCode);
}
```

---

## Dynamic Navigation Building

Navigation items declare optional `feature` and `permission` requirements; `buildNavigation()` recursively filters the tree so items (and empty parent groups) that the tenant/user cannot access are removed automatically.

---

## Master Admin Feature Management

Master Admin can toggle features per tenant via `PUT /admin/tenants/:tenantId/features`, with full audit logging (`FEATURE_ENABLED`/`FEATURE_DISABLED`) and automatic cache invalidation.

---

## Feature Usage Tracking

Every meaningful feature usage (e.g. `sale_created`) can be logged to `feature_usage_log` for analytics on adoption and upsell opportunities.

---

## Feature Migration Strategy

1. Define feature in `features` table
2. Backfill `tenant_features` for existing eligible tenants (e.g. by plan)
3. Implement guarded controller/service code
4. Update frontend navigation config

---

## Best Practices

1. **Granularity** — atomic, independent features, not too broad or too narrow
2. **Dependencies** — keep shallow, avoid cycles, document why
3. **Caching** — cache aggressively, invalidate on change
4. **Testing** — access, guards, dependency resolution, limits
5. **Documentation** — keep feature catalog current
