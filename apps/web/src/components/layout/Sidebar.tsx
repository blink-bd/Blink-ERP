import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFeature } from '@/contexts/FeaturesContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
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
  ArrowRightLeft,
  Settings,
  BellRing,
  FileText,
  RotateCcw,
  Building2,
  Wrench,
  UserCog,
  FileSpreadsheet,
  KeyRound,
  MapPin,
  X,
} from 'lucide-react';
import { usePermissions } from '@/lib/permissions';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
  permission?: string[];
  /** بيظهر بس لما يبقى فيه أكتر من فرع أو مخزن متاح للمستخدم. */
  requiresWorkspaceChoice?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { to: '/workspace', labelKey: 'workspace', icon: MapPin, requiresWorkspaceChoice: true },
  { to: '/pos', labelKey: 'pos', icon: ShoppingCart, feature: 'pos' },
  { to: '/sales', labelKey: 'sales', icon: FileText, feature: 'sales' },
  { to: '/returns', labelKey: 'returns', icon: RotateCcw, feature: 'return_disposition' },
  { to: '/maintenance', labelKey: 'maintenance', icon: Wrench, feature: 'maintenance_management' },
  { to: '/products', labelKey: 'products', icon: Package, feature: 'products' },
  { to: '/inventory', labelKey: 'inventory', icon: Warehouse, feature: 'inventory' },
  { to: '/transfers', labelKey: 'transfers', icon: ArrowRightLeft, feature: 'inventory' },
  { to: '/customers', labelKey: 'customers', icon: Users, feature: 'customers' },
  { to: '/suppliers', labelKey: 'suppliers', icon: Truck, feature: 'suppliers' },
  { to: '/purchases', labelKey: 'purchases', icon: ShoppingBag, feature: 'purchases' },
  { to: '/expenses', labelKey: 'expenses', icon: Wallet, feature: 'expenses' },
  { to: '/cash-register', labelKey: 'cashRegister', icon: Receipt, feature: 'cash_register' },
  { to: '/reports', labelKey: 'reports', icon: BarChart3, feature: 'reports' },
  { to: '/branch-reports', labelKey: 'branchReports', icon: Building2, feature: 'branch_analytics' },
  { to: '/balance-reminders', labelKey: 'balanceReminders', icon: BellRing, feature: 'balance_reminders' },
  { to: '/users', labelKey: 'users', icon: UserCog, permission: ['users.view', 'roles.manage'] },
  {
    to: '/data',
    labelKey: 'dataTransfer',
    icon: FileSpreadsheet,
    feature: 'import_export',
    permission: ['data.import', 'data.export'],
  },
  {
    to: '/api-keys',
    labelKey: 'apiKeys',
    icon: KeyRound,
    feature: 'api_access',
    permission: ['api_keys.manage'],
  },
  { to: '/settings', labelKey: 'settings', icon: Settings },
];

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation('nav');
  const featureEnabled = useFeature(item.feature || '__always__');
  const { has } = usePermissions();
  const { workspace } = useWorkspace();
  const hasFeature = item.feature ? featureEnabled : true;
  if (!hasFeature) return null;
  if (item.requiresWorkspaceChoice && !workspace?.showSelector) return null;
  if (item.permission && !has(...item.permission)) return null;

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
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt="الشعار"
              className="h-9 w-9 rounded bg-white/10 object-contain"
            />
          )}
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-white">{branding.appName}</h1>
          <button
            type="button"
            className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}
