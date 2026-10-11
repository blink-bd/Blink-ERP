import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password, needOtp ? otp : undefined);
      navigate('/admin');
    } catch (error: any) {
      const code = error?.response?.data?.error?.code;
      if (code === 'OTP_REQUIRED' || code === 'OTP_INVALID') {
        setNeedOtp(true);
        setOtp('');
      }
      /* باقي الأخطاء ظهرت من الـ interceptor */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4" dir="rtl">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-lg bg-white p-8 shadow-xl"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold">لوحة المدير العام</h1>
          <p className="mt-1 text-sm text-gray-500">دخول الإدارة فقط — كل المحاولات بتتسجل</p>
        </div>
        <div>
          <Label>البريد الإلكتروني</Label>
          <Input
            type="email"
            required
            autoComplete="username"
            dir="ltr"
            value={email}
            disabled={needOtp}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>كلمة المرور</Label>
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            disabled={needOtp}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {needOtp && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <Label className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-700" /> رمز التحقق (6 أرقام)
            </Label>
            <Input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              dir="ltr"
              className="mt-2 text-center text-xl tracking-[0.5em]"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <p className="mt-2 text-xs text-blue-800">
              افتح تطبيق Google Authenticator أو Microsoft Authenticator واكتب الرمز الحالي.
            </p>
          </div>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || (needOtp && otp.length !== 6)}
        >
          {loading ? 'جاري الدخول...' : needOtp ? 'تأكيد الدخول' : 'دخول'}
        </Button>
        {needOtp && (
          <button
            type="button"
            className="w-full text-center text-xs text-gray-500 hover:underline"
            onClick={() => {
              setNeedOtp(false);
              setOtp('');
            }}
          >
            رجوع وتغيير البيانات
          </button>
        )}
      </form>
    </div>
  );
}
