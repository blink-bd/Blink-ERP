import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch {
      /* الخطأ ظهر من الـ interceptor */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-lg shadow-xl p-8 space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold">لوحة المدير العام</h1>
          <p className="text-sm text-gray-500 mt-1">دخول الإدارة فقط</p>
        </div>
        <div>
          <Label>البريد الإلكتروني</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>كلمة المرور</Label>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'جاري الدخول...' : 'دخول'}</Button>
      </form>
    </div>
  );
}
