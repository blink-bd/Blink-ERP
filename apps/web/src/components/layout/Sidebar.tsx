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
];

function NavItemLink({ item }: { item: NavItem }) {
  const { t } = useTranslation('nav');
  const hasFeature = item.feature ? useFeature(item.feature) : true;
  if (!hasFeature) return null;

  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
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

export function Sidebar() {
  const { branding } = useBranding();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col" style={{ backgroundColor: branding.sidebarColor }}>
      <div className="px-4 py-5 border-b border-white/10 flex items-center gap-3">
        {branding.logoUrl && <img src={branding.logoUrl} alt="الشعار" className="h-9 w-9 object-contain rounded bg-white/10" />}
        <h1 className="text-white text-lg font-bold truncate">{branding.appName}</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </nav>
    </aside>
  );
}
