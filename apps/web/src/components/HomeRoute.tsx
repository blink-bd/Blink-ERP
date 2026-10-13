import { useContext, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { FeaturesContext } from '@/contexts/FeaturesContext';
import { FeatureLocked } from '@/components/ui/feature-locked';

/** ترتيب الصفحات اللي التاجر يتحوّل لأولها لو لوحة التحكم مقفولة. */
const FALLBACK_PAGES: Array<[string, string]> = [
  ['/pos', 'pos'],
  ['/sales', 'sales'],
  ['/products', 'products'],
  ['/inventory', 'inventory'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/purchases', 'purchases'],
  ['/expenses', 'expenses'],
  ['/cash-register', 'cash_register'],
  ['/reports', 'reports'],
  ['/returns', 'return_disposition'],
  ['/maintenance', 'maintenance_management'],
  ['/branch-reports', 'branch_analytics'],
  ['/balance-reminders', 'balance_reminders'],
  ['/users', 'users'],
  ['/settings', 'settings'],
];

/**
 * لوحة التحكم هي صفحة البداية. لو المدير العام قافلها للتاجر، بنوديه على أول صفحة
 * مفتوحة له بدل شاشة «مقفولة»؛ ولو كل حاجة مقفولة بنعرّفه إن الحساب مقفول من الإدارة.
 */
export function HomeRoute({ children }: { children: ReactNode }) {
  const { features, loading } = useContext(FeaturesContext);
  if (loading && features.size === 0) {
    return <div className="flex justify-center py-20 text-sm text-gray-400">جاري التحميل...</div>;
  }
  if (features.has('dashboard')) return <>{children}</>;
  const next = FALLBACK_PAGES.find(([, code]) => features.has(code));
  if (next) return <Navigate to={next[0]} replace />;
  return (
    <FeatureLocked
      title="الحساب مقفول"
      message="كل صفحات حسابك مقفولة حالياً من إدارة النظام. تواصل مع الإدارة."
    />
  );
}
