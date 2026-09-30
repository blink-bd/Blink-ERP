# src-tauri

هذا المجلد يحتاج تهيئة Rust الأساسية أول مرة تشغّل المشروع.

بعد تثبيت Rust (راجع docs/INSTALL_GUIDE.md)، شغّل من داخل apps/desktop:

```bash
npx tauri init
```

هيسألك أسئلة، جاوب:
- App name: ERP System
- Window title: ERP System
- Web assets location: ../dist
- Dev server URL: http://localhost:5173
- Frontend dev command: npm run dev
- Frontend build command: npm run build

ده هيولّد Cargo.toml وsrc/main.rs والأيقونات الافتراضية تلقائياً، ويحافظ على tauri.conf.json
الموجود بالفعل في هذا المجلد (أو يدمجه معاه).
