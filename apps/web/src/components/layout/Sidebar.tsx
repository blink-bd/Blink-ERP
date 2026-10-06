import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFeature } from '@/contexts/FeaturesContext';
import { useBranding } from '@/contexts/BrandingContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Users,
  Truck,
  ShoppingBag,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  X,
} from 'lucide-react';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { to: '/pos', labelKey: 'pos', icon: ShoppingCart, feature: 'pos' },
  { to: '/products', labelKey: 'products', icon: Package, feature: 'products' },
  { to: '/inventory', labelKey: 'inventory', icon: Warehouse, feature: 'inventory' },
  { to: '/customers', labelKey: 'customers', icon: Users, feature: 'customers' },
  { to: '/suppliers', labelKey: 'suppliers', icon: Truck, feature: 'suppliers' },
  { to: '/purchases', labelKey: 'purchases', icon: ShoppingBag, feature: 'purchases' },
  { to: '/expenses', labelKey: 'expenses', icon: Wallet, feature: 'expenses' },
  { to: '/cash-register', labelKey: 'cashRegister', icon: Receipt, feature: 'cash_register' },
  { to: '/reports', labelKey: 'reports', icon: BarChart3, feature: 'reports' },
  { to: '/settings', labelKey: 'settings', icon: Settings },
];

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation('nav');
  const featureEnabled = useFeature(item.feature || '__always__');
  const hasFeature = item.feature ? featureEnabled : true;
  if (!hasFeature) return null;

  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-primary text-primary-foreground' : 'text-gray-300 hover:bg-white/10'
        }`
      }
    >
      <Icon className="h-5 w-5" />
      <span>{t(item.labelKey)}</span>
    </NavLink>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { branding } = useBranding();

  return (
    <>
      <button
        type="button"
        aria-label="إغلاق القائمة الجانبية"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        aria-label="القائمة الجانبية"
        className={`fixed inset-y-0 right-0 z-50 flex h-screen w-64 shrink-0 flex-col transition-transform duration-300 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: branding.sidebarColor }}
      >
        <div className="px-4 py-5 border-b border-white/10 flex items-center gap-3">
          {branding.logoUrl && <img src={branding.logoUrl} alt="الشعار" className="h-9 w-9 object-contain rounded bg-white/10" />}
          <h1 className="min-w-0 flex-1 text-white text-lg font-bold truncate">{branding.appName}</h1>
          <button type="button" className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose} aria-label="إغلاق القائمة">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}
