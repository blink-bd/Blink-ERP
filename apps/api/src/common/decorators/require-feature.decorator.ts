import { SetMetadata } from '@nestjs/common';

export const REQUIRED_FEATURES_KEY = 'requiredFeatures';

/**
 * يشترط تفعيل ميزة (أو أكثر) للتاجر. لو اتحطت على الـ Controller وعلى الـ Handler
 * معاً، لازم كل الميزات تكون مفعّلة (Class + Handler = AND) وليس الاستبدال.
 *
 * مثال: @RequireFeature('sales') على الكلاس + @RequireFeature('returns') على
 * endpoint الاسترجاع => لازم الميزتين.
 */
export const RequireFeature = (...featureCodes: string[]) =>
  SetMetadata(REQUIRED_FEATURES_KEY, featureCodes);
