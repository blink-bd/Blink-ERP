# دليل تشغيل النظام محليًا

النظام حاليًا Web App مع Backend API. لا يحتاج إلى أدوات إضافية خارج Node.js وDocker.

## المتطلبات

- Node.js 18 أو أحدث.
- npm 9 أو أحدث.
- Docker Engine لتشغيل PostgreSQL محليًا.

## التثبيت

من مجلد المشروع الرئيسي:

```bash
npm install
cp .env.example .env
```

عدّل قيم الأسرار في `.env` قبل أي استخدام خارج بيئة التطوير، خاصة:

```env
DATABASE_URL=postgresql://erp_user:erp_password_2024@localhost:5432/erp_db
JWT_ACCESS_SECRET=غيّر-هذا-السر
JWT_REFRESH_SECRET=غيّر-هذا-السر
JWT_MASTER_SECRET=غيّر-هذا-السر-ويجب-أن-يكون-مختلفًا
```

## تشغيل قاعدة البيانات والخدمات المحلية

```bash
docker-compose up -d
```

PostgreSQL هو الخدمة المطلوبة حاليًا. Redis وMinIO موجودان في Compose للتوسعات المستقبلية، لكنهما ليسا شرطًا لتشغيل النسخة الحالية.

## تشغيل النظام

شغّل من جذر المشروع:

```bash
npm run dev
```

أو استخدم:

```bash
./start.sh
```

على Windows شغّل `start.bat`.

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Swagger في التطوير: `http://localhost:3000/api/docs`

## Migration و Seed

```bash
npm run db:migrate
npm run db:seed
```

يجب إنشاء حساب Master Admin من خلال متغيرات البيئة:

```env
MASTER_ADMIN_EMAIL=admin@example.com
MASTER_ADMIN_PASSWORD=كلمة-مرور-قوية
```

## إيقاف الخدمات

```bash
./stop.sh
```

أو على Windows شغّل `stop.bat`.
