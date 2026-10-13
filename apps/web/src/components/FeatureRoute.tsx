import { useContext, type ReactNode } from 'react';
import { FeaturesContext } from '@/contexts/FeaturesContext';
import { FeatureLocked } from '@/components/ui/feature-locked';

/**
 * بيقفل الصفحة لو المدير العام قافلها للتاجر — حتى لو حد فتح الرابط مباشرة.
 * (السيرفر كمان بيرفض الطلبات، ده بس عشان الشاشة تبقى واضحة بدل أخطاء متفرقة.)
 */
export function FeatureRoute({
  feature,
  title,
  children,
}: {
  feature: string;
  title: string;
  children: ReactNode;
}) {
  const { features, loading } = useContext(FeaturesContext);
  // أول تحميل بس — الـ polling الدوري ما يفكّش الصفحة المفتوحة.
  if (loading && features.size === 0) {
    return <div className="flex justify-center py-20 text-sm text-gray-400">جاري التحميل...</div>;
  }
  if (!features.has(feature)) return <FeatureLocked title={title} />;
  return <>{children}</>;
}
