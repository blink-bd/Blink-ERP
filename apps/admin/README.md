# Master Admin Web App (مستقبلي)

هذا المجلد محجوز لتطبيق الويب الخاص بـ Master Admin (إدارة كل التجّار، الميزات، الخطط، والمراقبة العامة للنظام).

يُبنى بنفس الـ stack المستخدم في apps/desktop (React + TypeScript + Vite + Tailwind + shadcn/ui)
لكن كتطبيق ويب عادي بدل Tauri، ويستهلك نفس الـ Backend API تحت `/api/v1/admin/*`
الموصوف في `docs/API.md` (قسم Master Admin API).

راجع docs/PROJECT_STATUS.md لمعرفة الترتيب المناسب لبنائه ضمن خطة المراحل.
