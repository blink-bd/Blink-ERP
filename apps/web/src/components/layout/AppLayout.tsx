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
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b px-6 py-3 flex items-center justify-between" style={{ backgroundColor: branding.headerColor }}>
          <div />
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.fullName}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              تسجيل الخروج
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <footer className="border-t bg-white px-6 py-3 text-center text-sm text-gray-500">
          {branding.footerLinkUrl ? (
            <a
              href={branding.footerLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700"
            >
              {branding.footerText}
            </a>
          ) : (
            <span>{branding.footerText}</span>
          )}
        </footer>
      </div>
    </div>
  );
}
