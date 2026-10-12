import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ReceiptData {
  verified: boolean;
  receiptNumber: string;
  issuedAt: string;
  currency: string;
  seller: { businessName: string; phone?: string; address?: string };
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    paymentStatus: string;
  };
  items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    total: number;
  }>;
}

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value);
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
};

export function ReceiptPage() {
  const { token = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const publicUrl = useMemo(() => window.location.href.split('?')[0], [token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get(`/receipts/${encodeURIComponent(token)}`)
      .then((response) => {
        if (active) setReceipt(response.data.data);
      })
      .catch(() => {
        if (active) setError('الإيصال غير موجود أو لم يعد متاحاً.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (receipt && searchParams.get('print') === '1') {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [receipt, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        جاري تحميل الإيصال الإلكتروني…
      </div>
    );
  }
  if (!receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-bold">تعذر التحقق من الإيصال</h1>
          <p className="mt-2 text-gray-500">{error || 'الإيصال غير موجود أو لم يعد متاحاً.'}</p>
          <Link to="/login" className="mt-5 inline-block text-primary">
            العودة إلى النظام
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel =
    receipt.totals.paymentStatus === 'paid'
      ? 'مدفوع'
      : receipt.totals.paymentStatus === 'partial'
        ? 'مدفوع جزئياً'
        : 'آجل';

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8" dir="rtl">
      <article className="mx-auto max-w-3xl rounded-xl border bg-white p-5 shadow-sm sm:p-8 print:max-w-none print:border-0 print:shadow-none">
        <header className="flex flex-col gap-5 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              <span aria-hidden="true">✓</span> إيصال إلكتروني موثّق من Blink ERP
            </div>
            <h1 className="mt-4 text-2xl font-bold">{receipt.seller.businessName}</h1>
            {receipt.seller.address && (
              <p className="mt-1 text-sm text-gray-500">{receipt.seller.address}</p>
            )}
            {receipt.seller.phone && (
              <p className="text-sm text-gray-500">{receipt.seller.phone}</p>
            )}
          </div>
          <div className="rounded-lg bg-gray-50 p-4 text-sm sm:min-w-48">
            <p>
              <span className="text-gray-500">رقم الإيصال:</span>{' '}
              <strong>{receipt.receiptNumber}</strong>
            </p>
            <p className="mt-2">
              <span className="text-gray-500">التاريخ:</span>{' '}
              {new Date(receipt.issuedAt).toLocaleString('ar-EG')}
            </p>
            <p className="mt-2">
              <span className="text-gray-500">حالة الدفع:</span> {statusLabel}
            </p>
          </div>
        </header>

        <section className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 text-right">الصنف</th>
                <th className="p-3 text-center">الكمية</th>
                <th className="p-3 text-left">سعر الوحدة</th>
                <th className="p-3 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr className="border-b" key={`${item.sku || item.name}-${index}`}>
                  <td className="p-3">
                    <div className="font-medium">{item.name}</div>
                    {item.sku && <div className="text-xs text-gray-400">{item.sku}</div>}
                  </td>
                  <td className="p-3 text-center">
                    {item.quantity} {item.unit || ''}
                  </td>
                  <td className="p-3 text-left">{money(item.unitPrice, receipt.currency)}</td>
                  <td className="p-3 text-left font-medium">
                    {money(item.total, receipt.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="space-y-2 text-sm sm:w-72">
            <div className="flex justify-between">
              <span>المجموع الفرعي</span>
              <span>{money(receipt.totals.subtotal, receipt.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>الخصم</span>
              <span>-{money(receipt.totals.discount, receipt.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>الضريبة</span>
              <span>{money(receipt.totals.tax, receipt.currency)}</span>
            </div>
            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <span>الإجمالي</span>
              <span>{money(receipt.totals.total, receipt.currency)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>المدفوع</span>
              <span>{money(receipt.totals.paid, receipt.currency)}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center">
            <QRCodeSVG value={publicUrl} size={128} level="M" includeMargin />
            <p className="text-xs text-gray-500">امسح الرمز للتحقق من الإيصال</p>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap justify-center gap-3 border-t pt-5 print:hidden">
          <Button onClick={() => window.print()}>طباعة / حفظ PDF</Button>
          <Button variant="outline" onClick={() => navigator.clipboard?.writeText(publicUrl)}>
            نسخ رابط الإيصال
          </Button>
          <Link to="/login" className="self-center text-sm text-gray-500">
            Blink ERP
          </Link>
        </footer>
        <p className="mt-5 text-center text-xs text-gray-400">
          هذا إيصال إلكتروني صادر من النظام. الإيصال الضريبي الرسمي يتطلب ربط واعتماد الجهة الضريبية
          المختصة.
        </p>
      </article>
    </main>
  );
}
