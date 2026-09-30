import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';

interface FeaturesContextValue {
  features: Set<string>;
  loading: boolean;
  reload: () => Promise<void>;
}

export const FeaturesContext = createContext<FeaturesContextValue>({
  features: new Set(),
  loading: true,
  reload: async () => {},
});

export const useFeature = (featureCode: string): boolean => {
  const { features } = useContext(FeaturesContext);
  return features.has(featureCode);
};

export const FeaturesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadFeatures = async () => {
    if (!isAuthenticated) {
      setFeatures(new Set());
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.get('/tenants/features');
      const codes: string[] = res.data.data.map((f: any) => f.code);
      setFeatures(new Set(codes));
    } catch {
      // Fallback to the standard feature set if the call fails (e.g. offline first load)
      setFeatures(
        new Set([
          'dashboard', 'pos', 'sales', 'products', 'inventory', 'customers',
          'suppliers', 'purchases', 'returns', 'cash_register', 'expenses', 'reports',
        ])
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, [isAuthenticated]);

  return (
    <FeaturesContext.Provider value={{ features, loading, reload: loadFeatures }}>
      {children}
    </FeaturesContext.Provider>
  );
};
