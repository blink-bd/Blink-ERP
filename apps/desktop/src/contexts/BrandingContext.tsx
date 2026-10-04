import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';

export interface TenantBranding {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  sidebarColor: string;
  headerColor: string;
  logoUrl?: string;
}

interface BrandingContextValue { branding: TenantBranding; loading: boolean }

const DEFAULT_BRANDING: TenantBranding = {
  appName: 'نظام نقاط البيع',
  primaryColor: '#0858A2',
  secondaryColor: '#64748B',
  sidebarColor: '#1E293B',
  headerColor: '#FFFFFF',
};

const BrandingContext = createContext<BrandingContextValue>({ branding: DEFAULT_BRANDING, loading: true });
export const useBranding = () => useContext(BrandingContext);

const hexToHsl = (hex: string) => {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      let resolved = DEFAULT_BRANDING;
      if (isAuthenticated) {
        try {
          const response = await api.get('/branding');
          const data = response.data.data;
          resolved = {
            ...DEFAULT_BRANDING,
            appName: data.appName || DEFAULT_BRANDING.appName,
            primaryColor: data.primaryColor || DEFAULT_BRANDING.primaryColor,
            secondaryColor: data.secondaryColor || DEFAULT_BRANDING.secondaryColor,
            sidebarColor: data.sidebarColor || DEFAULT_BRANDING.sidebarColor,
            headerColor: data.headerColor || DEFAULT_BRANDING.headerColor,
            logoUrl: data.logoUrl || undefined,
          };
        } catch {
          // استخدام الهوية الافتراضية إذا لم تتوفر هوية التاجر.
        }
      }
      const root = document.documentElement;
      root.style.setProperty('--primary', hexToHsl(resolved.primaryColor));
      root.style.setProperty('--ring', hexToHsl(resolved.primaryColor));
      root.style.setProperty('--sidebar-color', resolved.sidebarColor);
      root.style.setProperty('--header-color', resolved.headerColor);
      root.style.setProperty('--radius', '0.5rem');
      document.title = resolved.appName;
      setBranding(resolved);
      setLoading(false);
    };
    load();
  }, [isAuthenticated]);

  return <BrandingContext.Provider value={{ branding, loading }}>{children}</BrandingContext.Provider>;
};
