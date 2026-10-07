import { useState } from 'react';
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
  Menu,
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
];

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { t } = useTranslation('nav');
  const featureEnabled = useFeature(item.feature || '__always__');
  if (item.feature && !featureEnabled) return null;

  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-primary text-primary-foreground' : 'text-gray-300 hover:bg-white/10'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{t(item.labelKey)}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { branding } = useBranding();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="فتح القائمة"
        className="fixed right-4 top-3 z-40 rounded-lg bg-slate-800 p-2 text-white shadow md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && <button type="button" aria-label="إغلاق القائمة" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={close} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex h-screen w-72 shrink-0 flex-col shadow-xl transition-transform duration-200 md:sticky md:top-0 md:z-0 md:w-64 md:translate-x-0 md:shadow-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: branding.sidebarColor }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logoUrl && <img src={branding.logoUrl} alt="الشعار" className="h-9 w-9 rounded bg-white/10 object-contain" />}
            <h1 className="truncate text-lg font-bold text-white">{branding.appName}</h1>
          </div>
          <button type="button" aria-label="إغلاق القائمة" className="text-white md:hidden" onClick={close}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => <NavItemLink key={item.to} item={item} onNavigate={close} />)}
        </nav>
      </aside>
    </>
  );
}
