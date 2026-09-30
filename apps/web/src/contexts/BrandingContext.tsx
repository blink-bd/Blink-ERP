import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';

interface TenantBranding {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

interface BrandingContextValue {
  branding: TenantBranding;
  loading: boolean;
}

const DEFAULT_BRANDING: TenantBranding = {
  appName: 'نظام نقاط البيع',
  primaryColor: '#0858A2',
  secondaryColor: '#64748B',
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: true,
});

export const useBranding = () => useContext(BrandingContext);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      let resolved = DEFAULT_BRANDING;
      if (isAuthenticated) {
        try {
          const res = await api.get('/branding');
          resolved = {
            appName: res.data.data.appName,
            primaryColor: res.data.data.primaryColor,
            secondaryColor: res.data.data.secondaryColor,
            logoUrl: res.data.data.logoUrl,
          };
        } catch {
          // keep defaults if branding endpoint fails
        }
      }
      const root = document.documentElement;
      root.style.setProperty('--color-primary', resolved.primaryColor);
      document.title = resolved.appName;
      setBranding(resolved);
      setLoading(false);
    };
    load();
  }, [isAuthenticated]);

  return <BrandingContext.Provider value={{ branding, loading }}>{children}</BrandingContext.Provider>;
};
