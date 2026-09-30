# Internationalization (i18n) System

## Overview
Arabic is the default language (full RTL), with the architecture ready to add English without structural changes.

---

## Core Principles
1. Arabic first, full RTL support
2. English ready (no code changes needed later)
3. No hard-coded strings — everything via translation keys
4. Locale-aware formatting (numbers, dates, currency)
5. Plural/context support
6. Lazy loading of translation files
7. Type-safe translation keys

---

## Translation File Structure

```
locales/
├── ar/
│   ├── common.json
│   ├── auth.json
│   ├── nav.json
│   ├── sales.json
│   ├── products.json
│   ├── inventory.json
│   ├── customers.json
│   ├── suppliers.json
│   ├── reports.json
│   ├── settings.json
│   ├── errors.json
│   └── validation.json
└── en/  (mirrors ar/ structure, added later)
```

---

## Sample Translation Files

### ar/common.json (excerpt)
```json
{
  "common": {
    "actions": { "save": "حفظ", "cancel": "إلغاء", "delete": "حذف", "edit": "تعديل", "add": "إضافة" },
    "status": { "active": "نشط", "inactive": "غير نشط", "pending": "قيد الانتظار" },
    "messages": { "loading": "جاري التحميل...", "success": "تمت العملية بنجاح", "noData": "لا توجد بيانات" }
  }
}
```

### ar/nav.json (excerpt)
```json
{ "nav": { "dashboard": "لوحة التحكم", "sales": "المبيعات", "pos": "نقطة البيع", "inventory": "المخزون" } }
```

### ar/validation.json (excerpt)
```json
{ "validation": { "required": "{{field}} مطلوب", "email": "{{field}} غير صحيح", "min": "{{field}} يجب أن يكون على الأقل {{min}}" } }
```

Full versions of these files ship in `apps/desktop/src/i18n/locales/ar/`.

---

## Frontend Configuration

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar: { common: arCommon, nav: arNav, /* ... */ } },
    fallbackLng: 'ar',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });
```

### RTL/LTR Handler
```typescript
export function useDirection() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
    document.body.classList.remove('rtl', 'ltr');
    document.body.classList.add(dir);
  }, [i18n.language]);
  return { dir: i18n.language === 'ar' ? 'rtl' : 'ltr', isRTL: i18n.language === 'ar' };
}
```

---

## Formatting Utilities

```typescript
export function useFormatters() {
  const { i18n } = useTranslation();

  const formatCurrency = (amount: number, currency = 'SAR') =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency }).format(amount);

  const formatDate = (date: Date | string, format: 'short'|'medium'|'long'|'full' = 'medium') => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(i18n.language, { /* options per format */ }).format(d);
  };

  return { formatCurrency, formatDate, /* formatNumber, formatPercent, formatRelativeTime, ... */ };
}
```

---

## RTL/LTR Styling

CSS logical properties and direction-scoped overrides (`[dir='rtl'] .flex-row { flex-direction: row-reverse; }`, flipped borders/margins/rounded corners) ensure layouts mirror correctly. A `DirectionAware` component and Tailwind logical-property utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`) simplify RTL-safe component code.

---

## Language Switcher

A `LanguageSwitcher` dropdown lists available languages (currently only Arabic; English added later without further architecture changes) and calls `changeLanguage()` from `LanguageProvider`, which updates i18next, `localStorage`, and `document.documentElement.dir/lang`.

---

## Backend Translation Support

- Translatable entity fields use `name` (Arabic) + optional `nameEn` for future bilingual data.
- `LocalizationService` maps error codes to localized messages (`PRODUCT_NOT_FOUND` → `المنتج غير موجود` / `Product not found`).
- A `@Localize(locale)` decorator can post-process API responses to swap in English fields when requested via header.

---

## Type Safety

A `RecursiveKeyOf<T>` utility type derives valid translation key paths from the Arabic resource bundle, so `t('common:actions.save')` is type-checked at compile time.

---

## Testing i18n

Tests verify: all required keys resolve to non-key values, number/currency formatting matches Arabic locale conventions, and direction switches correctly with language change.

---

## Best Practices

1. Organize translation keys by namespace/module
2. Never hard-code UI strings
3. Use interpolation, not string concatenation
4. Handle plurals via i18next plural keys, not manual conditionals
5. Always use `Intl` formatting for numbers/dates/currency
6. Test all layouts in RTL
7. Keep translation files in sync and reviewed

---

## Migration Guide for Adding English

1. Create `locales/en/*.json` mirroring the Arabic structure
2. Add `en` to the `resources` object in i18n config
3. Add English entry to `LanguageSwitcher`
4. Test every screen/component in both directions
5. Add `nameEn`/`descriptionEn` columns where needed and backfill
