# White-Label Branding System

## Overview
Allows each tenant a fully customized visual identity: logos, colors, typography, and document templates — applied dynamically at runtime with no redeploy needed.

---

## Core Principles
1. Tenant-specific
2. Dynamic loading (not compile-time)
3. No code changes for rebranding
4. Safe customization (sanitize custom CSS)
5. Live preview support
6. Fallback defaults
7. Minimal performance impact

---

## Branding Components

- **Logos**: main, light, dark, favicon, login background
- **Colors**: primary/secondary/accent, sidebar/header, status colors
- **Typography**: font family, base size
- **Layout**: border radius, spacing unit
- **Business Info**: app name, business name, contact
- **Document Templates**: invoice (modern/classic/minimal), receipt (thermal/a4)

---

## Database Schema

```sql
CREATE TABLE tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  app_name VARCHAR(255) DEFAULT 'نظام نقاط البيع',
  app_name_en VARCHAR(255) DEFAULT 'Point of Sale System',
  logo_url VARCHAR(500),
  logo_light_url VARCHAR(500),
  logo_dark_url VARCHAR(500),
  favicon_url VARCHAR(500),
  login_background_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#0858A2',
  primary_dark VARCHAR(7),
  primary_light VARCHAR(7),
  secondary_color VARCHAR(7) DEFAULT '#64748B',
  accent_color VARCHAR(7) DEFAULT '#10B981',
  background_color VARCHAR(7) DEFAULT '#FFFFFF',
  surface_color VARCHAR(7) DEFAULT '#F8FAFC',
  sidebar_color VARCHAR(7) DEFAULT '#1E293B',
  header_color VARCHAR(7) DEFAULT '#FFFFFF',
  text_primary VARCHAR(7) DEFAULT '#1F2937',
  text_secondary VARCHAR(7) DEFAULT '#6B7280',
  text_on_primary VARCHAR(7) DEFAULT '#FFFFFF',
  border_color VARCHAR(7) DEFAULT '#E5E7EB',
  divider_color VARCHAR(7) DEFAULT '#E5E7EB',
  success_color VARCHAR(7) DEFAULT '#10B981',
  warning_color VARCHAR(7) DEFAULT '#F59E0B',
  error_color VARCHAR(7) DEFAULT '#EF4444',
  info_color VARCHAR(7) DEFAULT '#3B82F6',
  font_family VARCHAR(255) DEFAULT 'Cairo, sans-serif',
  font_size_base VARCHAR(10) DEFAULT '16px',
  border_radius VARCHAR(10) DEFAULT '0.5rem',
  spacing_unit VARCHAR(10) DEFAULT '0.25rem',
  login_background_color VARCHAR(7),
  login_position VARCHAR(20) DEFAULT 'center',
  login_card_background VARCHAR(7),
  login_show_logo BOOLEAN DEFAULT true,
  invoice_template VARCHAR(50) DEFAULT 'modern',
  invoice_header_color VARCHAR(7),
  invoice_show_logo BOOLEAN DEFAULT true,
  invoice_show_tax_info BOOLEAN DEFAULT true,
  invoice_footer_text TEXT,
  receipt_template VARCHAR(50) DEFAULT 'thermal',
  receipt_width INTEGER DEFAULT 80,
  receipt_show_logo BOOLEAN DEFAULT true,
  receipt_header_text TEXT,
  receipt_footer_text TEXT,
  custom_css TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_tenant_branding_tenant ON tenant_branding(tenant_id);
```

---

## CSS Variables System

Branding is compiled into a `ThemeTokens` set of CSS custom properties (`--color-primary`, `--font-family-base`, `--spacing-*`, etc.), applied at runtime via `ThemeService.applyTheme()`.

```typescript
class ThemeService {
  applyTheme(branding: TenantBranding): void {
    this.setVariable('--color-primary', branding.colors.primary);
    // ...all color/typography/layout variables
    if (branding.customCss) this.applyCustomCss(branding.customCss);
    this.updateMetadata(branding); // title, favicon, theme-color meta
  }

  private applyCustomCss(css: string): void {
    const existing = document.getElementById('tenant-custom-css');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 'tenant-custom-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
}
```

---

## Backend Implementation

### BrandingService (key methods)
- `getTenantBranding(tenantId)` — cached, creates defaults if missing
- `updateBranding(tenantId, updates)` — validates hex colors, sanitizes custom CSS, invalidates cache, audit logs
- `uploadLogo(tenantId, file, type)` — validates size/type per logo type, stores via FileService
- `uploadLoginBackground(tenantId, file)`

### Custom CSS Sanitization
Strips dangerous patterns (`javascript:`, `expression(`, `@import`, `behavior:`, `-moz-binding:`) and enforces a max length (10,000 chars).

### Logo Validation Rules
| Type | Max Size | Formats |
|---|---|---|
| main/light/dark | 2MB | png, jpeg, svg |
| favicon | 100KB | ico, png |
| login background | 5MB | jpeg, png, webp |

---

## Frontend Implementation

`BrandingProvider` loads branding on auth, applies the theme via `ThemeService`, and exposes `updateBranding()` for the settings UI. The Branding Settings page has tabs for General / Colors / Logos with live preview and color pickers.

---

## Master Admin Branding Management

Master Admin can view/update any tenant's branding (`GET/PUT /admin/tenants/:tenantId/branding`) and reset to defaults (`POST /admin/tenants/:tenantId/branding/reset`), all audit-logged.

---

## Invoice/Receipt Templates

`InvoiceTemplate` component picks Modern/Classic/Minimal layout based on `branding.invoice.template`, using the tenant's primary color, logo, and tax info settings for a fully white-labeled document.

---

## Best Practices

1. **Performance** — cache branding, lazy-load backgrounds, optimize images
2. **Validation** — validate colors, sanitize CSS, validate uploads
3. **UX** — live preview, easy reset to defaults
4. **Consistency** — use design tokens everywhere
5. **Migration** — sensible defaults for existing tenants
