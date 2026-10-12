import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * حاجز أخطاء عام للتطبيق: عند حدوث خطأ أثناء العرض (render error) في أي صفحة،
 * يعرض رسالة عربية واضحة مع خيارات للتعافي بدلًا من شاشة بيضاء بالكامل.
 *
 * ملاحظة: يُعاد ضبط هذا الحاجز عند تغيير المسار عبر key={location.pathname} في App.tsx.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // نسجل الخطأ في الكونسول للمساعدة في التشخيص دون كسر تجربة المستخدم.
    console.error('AppErrorBoundary caught a render error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow">
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">حدث خطأ غير متوقع</h1>
            <p className="mb-6 text-sm text-gray-500">
              نعتذر عن هذا الخلل. يمكنك إعادة تحميل الصفحة أو العودة إلى الصفحة الرئيسية، وإذا
              تكررت المشكلة يرجى التواصل مع الدعم الفني.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button type="button" onClick={this.handleReload}>
                إعادة تحميل الصفحة
              </Button>
              <Button type="button" variant="outline" onClick={this.handleGoHome}>
                العودة للرئيسية
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
