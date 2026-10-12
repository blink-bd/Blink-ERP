import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';

interface Admin {
  id: string;
  email: string;
  fullName: string;
}
interface Ctx {
  admin: Admin | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<Ctx>({
  admin: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});
export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/admin') || location.pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    adminApi
      .get('/admin/auth/me')
      .then((response) => setAdmin(response.data.data))
      .catch(() => setAdmin(null))
      .finally(() => setIsLoading(false));
  }, [location.pathname]);

  const login = async (email: string, password: string) => {
    const response = await adminApi.post('/admin/auth/login', { email, password });
    setAdmin(response.data.data.admin);
  };

  const logout = () => {
    void adminApi.post('/admin/auth/logout').catch(() => undefined);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
