import { useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, Send, ShieldCheck, Store, X } from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const NAV = [
  { to: '/admin', end: true, label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/admin/tenants', label: 'التجّار', icon: Store },
  { to: '/admin/channels', label: 'قنوات الإرسال', icon: Send },
  { to: '/admin/security', label: 'الأمان', icon: ShieldCheck },
];

export function AdminLayout() {
  const { admin, isLoading, logout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        جاري التحميل...
      </div>
    );
  if (!admin) return <Navigate to="/admin/login" replace />;

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const nav = (
    <nav className="space-y-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          end={item.end}
          to={item.to}
          className={link}
          onClick={() => setOpen(false)}
        >
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{item.label}</span>
          {item.to === '/admin/security' && !admin.twoFactorEnabled && (
            <span
              className="h-2 w-2 rounded-full bg-amber-400"
              title="المصادقة الثنائية غير مفعّلة"
            />
          )}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500 font-black text-white">
        B
      </span>
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">Blink ERP</div>
        <div className="text-[11px] text-slate-400">لوحة المدير العام</div>
      </div>
    </div>
  );

  const account = (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-3 truncate text-sm text-slate-300">{admin.fullName}</div>
      <button
        onClick={logout}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4" /> خروج
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-60 flex-col justify-between bg-slate-900 p-4 lg:flex">
        <div className="space-y-6">
          {brand}
          {nav}
        </div>
        {account}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        {brand}
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-200 hover:bg-white/10"
          aria-label="القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-64 flex-col justify-between bg-slate-900 p-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                {brand}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-slate-300"
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
            </div>
            {account}
          </div>
        </div>
      )}

      <div className="lg:pr-60">
        {!admin.twoFactorEnabled && (
          <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            المصادقة الثنائية غير مفعّلة على حساب الإدارة.{' '}
            <NavLink to="/admin/security" className="font-semibold underline">
              فعّلها الآن
            </NavLink>{' '}
            لحماية النظام كله.
          </div>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
