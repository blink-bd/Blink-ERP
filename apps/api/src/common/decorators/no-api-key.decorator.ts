import { SetMetadata } from '@nestjs/common';

export const NO_API_KEY = 'noApiKey';

/**
 * يمنع استخدام مفاتيح الـ API على endpoint معيّن (لازم مستخدم حقيقي بتسجيل دخول).
 * يُستخدم على العمليات الحساسة: إدارة المستخدمين والصلاحيات، مفاتيح الـ API نفسها،
 * النسخ الاحتياطي، تغيير كلمة المرور...
 */
export const NoApiKey = () => SetMetadata(NO_API_KEY, true);
