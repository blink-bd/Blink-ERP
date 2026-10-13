import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { FeaturesProvider } from './contexts/FeaturesContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { AppLayout } from './components/layout/AppLayout';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { FeatureRoute } from './components/FeatureRoute';
import { HomeRoute } from '@/components/HomeRoute';
import { useDevToolsShortcutGuard } from './hooks/useDevToolsShortcutGuard';

const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })));
const WorkspacePage = lazy(() =>
  import('./pages/Workspace').then((m) => ({ default: m.WorkspacePage }))
);
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const POSPage = lazy(() => import('./pages/POS').then((m) => ({ default: m.POSPage })));
const SalesPage = lazy(() => import('./pages/Sales').then((m) => ({ default: m.SalesPage })));
const ReturnsPage = lazy(() => import('./pages/Returns').then((m) => ({ default: m.ReturnsPage })));
const BranchReportsPage = lazy(() => import('./pages/BranchReports').then((m) => ({ default: m.BranchReportsPage })));
const MaintenancePage = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.MaintenancePage })));
const ProductsPage = lazy(() => import('./pages/Products').then((m) => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import('./pages/Inventory').then((m) => ({ default: m.InventoryPage })));
const CustomersPage = lazy(() => import('./pages/Customers').then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = lazy(() => import('./pages/Suppliers').then((m) => ({ default: m.SuppliersPage })));
const PurchasesPage = lazy(() => import('./pages/Purchases').then((m) => ({ default: m.PurchasesPage })));
const ExpensesPage = lazy(() => import('./pages/Expenses').then((m) => ({ default: m.ExpensesPage })));
const CashRegisterPage = lazy(() => import('./pages/CashRegister').then((m) => ({ default: m.CashRegisterPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })));
const TransfersPage = lazy(() => import('./pages/Transfers').then((m) => ({ default: m.TransfersPage })));
const ReceiptPage = lazy(() => import('./pages/Receipt').then((m) => ({ default: m.ReceiptPage })));
const BalanceRemindersPage = lazy(() => import('./pages/BalanceReminders').then((m) => ({ default: m.BalanceRemindersPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import('./pages/Users').then((m) => ({ default: m.UsersPage })));
const ApiKeysPage = lazy(() => import('./pages/ApiKeys').then((m) => ({ default: m.ApiKeysPage })));
const DataTransferPage = lazy(() => import('./pages/DataTransfer').then((m) => ({ default: m.DataTransferPage })));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLogin').then((m) => ({ default: m.AdminLoginPage })));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboardPage })));
const AdminTenantsPage = lazy(() => import('./pages/admin/AdminTenants').then((m) => ({ default: m.AdminTenantsPage })));
const AdminTenantDetailPage = lazy(() => import('./pages/admin/AdminTenantDetail').then((m) => ({ default: m.AdminTenantDetailPage })));
const AdminChannelsPage = lazy(() => import('./pages/admin/AdminChannels').then((m) => ({ default: m.AdminChannelsPage })));
const AdminSecurityPage = lazy(() => import('./pages/admin/AdminSecurity').then((m) => ({ default: m.AdminSecurityPage })));

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500" role="status">
      جاري التحميل...
    </div>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/receipt/:token" element={<ReceiptPage />} />
        <Route path="/purchase-invoice/:token" element={<ReceiptPage kind="purchase" />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="tenants" element={<AdminTenantsPage />} />
          <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
          <Route path="channels" element={<AdminChannelsPage />} />
          <Route path="security" element={<AdminSecurityPage />} />
        </Route>
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<HomeRoute><DashboardPage /></HomeRoute>} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/pos" element={<FeatureRoute feature="pos" title="نقطة البيع"><POSPage /></FeatureRoute>} />
          <Route path="/sales" element={<FeatureRoute feature="sales" title="المبيعات"><SalesPage /></FeatureRoute>} />
          <Route path="/returns" element={<FeatureRoute feature="return_disposition" title="المرتجعات"><ReturnsPage /></FeatureRoute>} />
          <Route path="/maintenance" element={<FeatureRoute feature="maintenance_management" title="الصيانة"><MaintenancePage /></FeatureRoute>} />
          <Route path="/products" element={<FeatureRoute feature="products" title="المنتجات"><ProductsPage /></FeatureRoute>} />
          <Route path="/inventory" element={<FeatureRoute feature="inventory" title="المخزون"><InventoryPage /></FeatureRoute>} />
          <Route path="/customers" element={<FeatureRoute feature="customers" title="العملاء"><CustomersPage /></FeatureRoute>} />
          <Route path="/suppliers" element={<FeatureRoute feature="suppliers" title="الموردين"><SuppliersPage /></FeatureRoute>} />
          <Route path="/purchases" element={<FeatureRoute feature="purchases" title="المشتريات"><PurchasesPage /></FeatureRoute>} />
          <Route path="/expenses" element={<FeatureRoute feature="expenses" title="المصروفات"><ExpensesPage /></FeatureRoute>} />
          <Route path="/cash-register" element={<FeatureRoute feature="cash_register" title="الخزينة"><CashRegisterPage /></FeatureRoute>} />
          <Route path="/reports" element={<FeatureRoute feature="reports" title="التقارير"><ReportsPage /></FeatureRoute>} />
          <Route path="/branch-reports" element={<FeatureRoute feature="branch_analytics" title="تقارير الفروع"><BranchReportsPage /></FeatureRoute>} />
          <Route path="/balance-reminders" element={<FeatureRoute feature="balance_reminders" title="تذكير المديونيات"><BalanceRemindersPage /></FeatureRoute>} />
          <Route path="/transfers" element={<FeatureRoute feature="inventory" title="الفروع والتحويلات"><TransfersPage /></FeatureRoute>} />
          <Route path="/users" element={<FeatureRoute feature="users" title="المستخدمين والصلاحيات"><UsersPage /></FeatureRoute>} />
          <Route path="/api-keys" element={<ApiKeysPage />} />
          <Route path="/data" element={<DataTransferPage />} />
          <Route path="/settings" element={<FeatureRoute feature="settings" title="الإعدادات"><SettingsPage /></FeatureRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

function GuardedAppRoutes() {
  const location = useLocation();
  return (
    <AppErrorBoundary key={location.pathname}>
      <AppRoutes />
    </AppErrorBoundary>
  );
}

function App() {
  const { i18n } = useTranslation();
  useDevToolsShortcutGuard();

  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
    document.body.classList.remove('rtl', 'ltr');
    document.body.classList.add(dir);
  }, [i18n.language]);

  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <AuthProvider>
          <FeaturesProvider>
            <WorkspaceProvider>
              <BrandingProvider>
                <GuardedAppRoutes />
              </BrandingProvider>
            </WorkspaceProvider>
          </FeaturesProvider>
        </AuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}

export default App;
