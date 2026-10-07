import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { FeaturesProvider } from './contexts/FeaturesContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { AppLayout } from './components/layout/AppLayout';

const LoginPage = lazy(() => import('./pages/Login').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })));
const POSPage = lazy(() => import('./pages/POS').then((module) => ({ default: module.POSPage })));
const ProductsPage = lazy(() => import('./pages/Products').then((module) => ({ default: module.ProductsPage })));
const InventoryPage = lazy(() => import('./pages/Inventory').then((module) => ({ default: module.InventoryPage })));
const CustomersPage = lazy(() => import('./pages/Customers').then((module) => ({ default: module.CustomersPage })));
const SuppliersPage = lazy(() => import('./pages/Suppliers').then((module) => ({ default: module.SuppliersPage })));
const PurchasesPage = lazy(() => import('./pages/Purchases').then((module) => ({ default: module.PurchasesPage })));
const ExpensesPage = lazy(() => import('./pages/Expenses').then((module) => ({ default: module.ExpensesPage })));
const CashRegisterPage = lazy(() => import('./pages/CashRegister').then((module) => ({ default: module.CashRegisterPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportsPage })));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLogin').then((module) => ({ default: module.AdminLoginPage })));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboardPage })));
const AdminTenantsPage = lazy(() => import('./pages/admin/AdminTenants').then((module) => ({ default: module.AdminTenantsPage })));
const AdminTenantDetailPage = lazy(() => import('./pages/admin/AdminTenantDetail').then((module) => ({ default: module.AdminTenantDetailPage })));

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

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="tenants" element={<AdminTenantsPage />} />
          <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pos" element={<POSPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/cash-register" element={<CashRegisterPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const { i18n } = useTranslation();

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
            <BrandingProvider>
              <AppRoutes />
            </BrandingProvider>
          </FeaturesProvider>
        </AuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}

export default App;
