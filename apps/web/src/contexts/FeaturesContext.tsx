import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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

// بعد ما المدير العام يفعّل/يوقف ميزة لتاجر، لازم واجهة التاجر تلتقط التغيير
// بدون ما يحتاج يعمل تسجيل خروج/دخول من جديد. فبنعمل reload دوري (polling)
// كل فترة قصيرة بجانب إعادة التحميل عند رجوع التبويب للـ focus.
const POLL_INTERVAL_MS = 30 * 1000;

export const FeaturesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  const loadFeatures = async () => {
    if (!isAuthenticatedRef.current) {
      setFeatures(new Set());
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // cache bust: query فريدة تمنع أي كاش من المتصفح أو أي طبقة وسيطة
      // (CDN / service worker) من إرجاع نسخة قديمة من قائمة الميزات.
      const res = await api.get('/tenants/features', { params: { _: Date.now() } });
      const codes: string[] = res.data.data.map((f: any) => f.code);
      setFeatures(new Set(codes));
    } catch (err: any) {
      // Fail closed on auth errors or when nothing was loaded yet. A transient
      // network blip during the periodic poll keeps the last confirmed list so
      // an open page (e.g. the POS mid-sale) doesn't suddenly lock — the server
      // still enforces every feature on each request anyway.
      const status = err?.response?.status;
      setFeatures((prev) => (prev.size > 0 && (!status || status >= 500) ? prev : new Set()));
    } finally {
      setLoading(false);
    }
  };

  // إعادة تحميل الميزات فور تسجيل الدخول/الخروج
  useEffect(() => {
    loadFeatures();
  }, [isAuthenticated]);

  // إعادة تحميل الميزات عند رجوع المستخدم للتبويب أو استعادة الاتصال —
  // يغطي حالة "فعّلت الميزة من لوحة المدير العام وأنا شغّال بالفعل كتاجر".
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadFeatures();
    };
    const onFocus = () => loadFeatures();
    const onOnline = () => loadFeatures();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Polling دوري خفيف كـ "شبكة أمان" حتى لو التبويب فاضل مفتوح وما حصلش focus/blur.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isAuthenticatedRef.current) loadFeatures();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <FeaturesContext.Provider value={{ features, loading, reload: loadFeatures }}>
      {children}
    </FeaturesContext.Provider>
  );
};
