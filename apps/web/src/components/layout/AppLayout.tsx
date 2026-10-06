import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/contexts/BrandingContext';
import { Menu } from 'lucide-react';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [sidebarOpen]);

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3" style={{ backgroundColor: branding.headerColor }}>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <span className="hidden truncate text-sm text-gray-600 sm:inline">{user?.fullName}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              تسجيل الخروج
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
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
