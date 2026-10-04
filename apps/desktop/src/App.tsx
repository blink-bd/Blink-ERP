import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FeaturesProvider } from './contexts/FeaturesContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { POSPage } from './pages/POS';
import { ProductsPage } from './pages/Products';
import { InventoryPage } from './pages/Inventory';
import { CustomersPage } from './pages/Customers';
import { SuppliersPage } from './pages/Suppliers';
import { PurchasesPage } from './pages/Purchases';
import { ExpensesPage } from './pages/Expenses';
import { CashRegisterPage } from './pages/CashRegister';
import { ReportsPage } from './pages/Reports';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">جاري التحميل...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        {/* إعدادات الهوية البصرية ملك للمدير العام فقط. */}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
    document.body.classList.add(dir);
  }, [i18n.language]);

  return (
    <BrowserRouter>
      <AuthProvider>
        <FeaturesProvider>
          <BrandingProvider>
            <AppRoutes />
          </BrandingProvider>
        </FeaturesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
