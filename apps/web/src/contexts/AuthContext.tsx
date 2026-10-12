import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // الاعتماد على HttpOnly cookies؛ لا يُخزّن أي JWT في localStorage.
      const response = await api.get('/auth/me');
      setUser(response.data.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, tenantId: string) => {
    try {
      const response = await api.post(`/auth/login?tenantId=${encodeURIComponent(tenantId)}`, {
        email,
        password,
      });
      setUser(response.data.data.user);
      toast.success('تم تسجيل الدخول بنجاح');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'فشل تسجيل الدخول';
      toast.error(message);
      throw error;
    }
  };

  const logout = () => {
    void api.post('/auth/logout').catch(() => undefined);
    setUser(null);
    toast.success('تم تسجيل الخروج');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
