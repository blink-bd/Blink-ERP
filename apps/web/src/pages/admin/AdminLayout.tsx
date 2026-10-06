import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Button } from '@/components/ui/button';

export function AdminLayout() {
  const { admin, isLoading, logout } = useAdminAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">جاري التحميل...</div>;
  if (!admin) return <Navigate to="/admin/login" replace />;

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded text-sm ${isActive ? 'bg-white/20 text-white' : 'text-gray-300 hover:bg-white/10'}`;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-slate-900 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <span className="text-white font-bold">لوحة المدير العام</span>
          <nav className="flex flex-wrap gap-2">
            <NavLink end to="/admin" className={link}>الرئيسية</NavLink>
            <NavLink to="/admin/tenants" className={link}>التجّار</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm text-gray-300 sm:inline">{admin.fullName}</span>
          <Button size="sm" variant="outline" onClick={logout}>خروج</Button>
        </div>
      </header>
      <main className="p-4 sm:p-6 max-w-6xl mx-auto"><Outlet /></main>
    </div>
  );
}
