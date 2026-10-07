import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/contexts/BrandingContext';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center justify-between border-b px-4 py-3 shadow-sm sm:px-6"
          style={{ backgroundColor: branding.headerColor }}
        >
          <span className="text-xs text-gray-500 md:hidden">{branding.appName}</span>
          <div className="mr-auto flex items-center gap-3 sm:gap-4">
            <span className="hidden text-sm text-gray-600 sm:inline">{user?.fullName}</span>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              تسجيل الخروج
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
