import { useContext, type ReactNode } from 'react';
import { FeaturesContext } from '@/contexts/FeaturesContext';
import { FeatureLocked } from '@/components/ui/feature-locked';
import { usePermissions } from '@/lib/permissions';

/**
 * بيقفل الصفحة لو المدير العام قافلها للتاجر — حتى لو حد فتح الرابط مباشرة.
 * (السيرفر كمان بيرفض الطلبات، ده بس عشان الشاشة تبقى واضحة بدل أخطاء متفرقة.)
 */
export function FeatureRoute({
  feature,
  title,
  permission,
  children,
}: {
  feature: string;
  title: string;
  permission?: string;
  children: ReactNode;
}) {
  const { features, loading } = useContext(FeaturesContext);
  const { has } = usePermissions();
  // أول تحميل بس — الـ polling الدوري ما يفكّش الصفحة المفتوحة.
  if (loading && features.size === 0) {
    return <div className="flex justify-center py-20 text-sm text-gray-400">جاري التحميل...</div>;
  }
  if (!features.has(feature)) return <FeatureLocked title={title} />;
  if (permission && !has(permission)) {
    return <FeatureLocked title={title} message="ليس لديك صلاحية عرض الصفحة دي. تواصل مع مالك النشاط." />;
  }
  return <>{children}</>;
}
