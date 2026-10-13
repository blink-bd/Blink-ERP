import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SaleItem {
  id: string;
  productName: string;
  quantity: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  taxRate?: number | string;
  remainingQuantity?: number;
}

interface SaleDetails {
  id: string;
  saleNumber: string;
  customerId?: string | null;
  subtotal: number | string;
  discountAmount: number | string;
  total: number | string;
  paidAmount: number | string;
  status: string;
  items: SaleItem[];
  returnsSummary?: {
    count: number;
    returnedTotal: number;
    invoiceCredit: number;
    refunded: number;
    remainingAmount: number;
    paymentMethodId: string | null;
  };
}

interface PaymentMethod {
  id: string;
  nameAr: string;
  name: string;
  code: string;
}

const money = (v: number) =>
  Number(v || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * نافذة مرتجع من فاتورة بيع (من صفحة المبيعات أو كشف حساب العميل).
 * الجزء الآجل من الفاتورة بيتخصم منها، والجزء المدفوع يترد للعميل (نقدي/كارت/تحويل)
 * أو يتخصم من مديونيته على فواتير تانية.
 */
export function SaleReturnDialog({
  saleId,
  reason: defaultReason,
  onClose,
  onDone,
}: {
  saleId: string | null;
  reason?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [refundMode, setRefundMode] = useState<'refund' | 'account'>('refund');
  const [methodId, setMethodId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    setSale(null);
    setQtys({});
    setReason(defaultReason || '');
    setRefundMode('refund');
    setLoading(true);
    Promise.all([api.get(`/sales/${saleId}`), api.get('/sales/payment-methods')])
      .then(([saleRes, methodsRes]) => {
        if (cancelled) return;
        const details: SaleDetails = saleRes.data.data;
        const list: PaymentMethod[] = (methodsRes.data.data || []).filter(
          (m: PaymentMethod) => m.code !== 'credit'
        );
        setSale(details);
        setMethods(list);
        const preferred = details.returnsSummary?.paymentMethodId;
        setMethodId(
          (preferred && list.some((m) => m.id === preferred) ? preferred : '') ||
            list.find((m) => m.code === 'cash')?.id ||
            list[0]?.id ||
            ''
        );
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || 'تعذر تحميل الفاتورة');
          onClose();
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // onClose متعمد مش في الـ deps عشان النافذة متتحملش تاني مع كل render للأب
     
  }, [saleId, defaultReason]);

  // تقدير قيمة المرتجع بنفس معادلة السيرفر (توزيع خصم الفاتورة + الضريبة).
  const estimate = useMemo(() => {
    if (!sale) return { total: 0, invoiceCredit: 0, paidPortion: 0 };
    const subtotal = Number(sale.subtotal || 0);
    const discount = Math.min(Math.max(Number(sale.discountAmount || 0), 0), subtotal);
    const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
    let total = 0;
    for (const item of sale.items || []) {
      const q = Number(qtys[item.id] || 0);
      if (!(q > 0)) continue;
      const originalQty = Number(item.quantity) || 1;
      const lineUnit = Math.max(
        0,
        Number(item.unitPrice) - Number(item.discountAmount || 0) / originalQty
      );
      total += lineUnit * factor * q + (lineUnit * q * Number(item.taxRate || 0)) / 100;
    }
    const alreadyReturned = Number(sale.returnsSummary?.returnedTotal || 0);
    total = Math.max(0, Math.min(total, Number(sale.total) - alreadyReturned));
    const remaining = sale.customerId ? Number(sale.returnsSummary?.remainingAmount || 0) : 0;
    const invoiceCredit = Math.min(total, remaining);
    return { total, invoiceCredit, paidPortion: total - invoiceCredit };
  }, [sale, qtys]);

  const submit = async () => {
    if (!sale) return;
    const items = (sale.items || [])
      .map((item) => ({ saleItemId: item.id, quantity: Number(qtys[item.id] || 0) }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      toast.error('حدد كمية صنف واحد على الأقل للاسترجاع');
      return;
    }
    for (const item of sale.items) {
      const q = Number(qtys[item.id] || 0);
      const remaining = Number(item.remainingQuantity ?? item.quantity);
      if (q > remaining) {
        toast.error(`الكمية المطلوبة من «${item.productName}» أكبر من المتبقي (${remaining})`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await api.post(`/sales/${sale.id}/return`, {
        items,
        reason: reason.trim() || undefined,
        refundMode: estimate.paidPortion > 0 ? refundMode : undefined,
        refundMethodId:
          estimate.paidPortion > 0 && refundMode === 'refund' && methodId ? methodId : undefined,
      });
      const r = res.data.data || {};
      const parts = [
        Number(r.invoiceCredit) > 0 ? `اتخصم من الفاتورة ${money(r.invoiceCredit)}` : '',
        Number(r.accountCredit) > 0 ? `اتخصم من مديونية العميل ${money(r.accountCredit)}` : '',
        Number(r.refundPaid) > 0 ? `مبلغ يترد للعميل ${money(r.refundPaid)}` : '',
      ].filter(Boolean);
      toast.success(
        `تم تسجيل المرتجع ${r.returnNumber || ''} وإرساله للفحص${parts.length ? ` — ${parts.join('، ')}` : ''}`,
        { duration: 7000 }
      );
      onDone?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تسجيل المرتجع');
    } finally {
      setSaving(false);
    }
  };

  const methodName = methods.find((m) => m.id === methodId)?.nameAr || 'نقدي';

  return (
    <Modal
      open={!!saleId}
      title={sale ? `مرتجع من فاتورة ${sale.saleNumber}` : 'مرتجع من فاتورة'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving || loading || !sale || estimate.total <= 0}>
            {saving ? 'جاري التنفيذ...' : 'تأكيد الاسترجاع'}
          </Button>
        </div>
      }
    >
      {loading || !sale ? (
        <p className="py-6 text-center text-sm text-gray-400">جاري تحميل الفاتورة...</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-gray-500">إجمالي الفاتورة</div>
              <div className="font-semibold">{money(Number(sale.total))}</div>
            </div>
            <div>
              <div className="text-gray-500">المدفوع</div>
              <div className="font-semibold">{money(Number(sale.paidAmount))}</div>
            </div>
            <div>
              <div className="text-gray-500">مرتجعات سابقة</div>
              <div className="font-semibold">
                {money(Number(sale.returnsSummary?.returnedTotal || 0))}
              </div>
            </div>
            <div>
              <div className="text-gray-500">المتبقي على الفاتورة</div>
              <div className="font-semibold">
                {money(Number(sale.returnsSummary?.remainingAmount || 0))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs text-gray-500">حدد الكمية المطلوب استرجاعها لكل صنف</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {sale.items?.map((item) => {
                const remaining = Number(item.remainingQuantity ?? item.quantity);
                const done = remaining <= 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b pb-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="text-xs text-gray-500">
                        المباع: {Number(item.quantity)} — المتبقي: {remaining} — السعر:{' '}
                        {money(Number(item.unitPrice))}
                      </p>
                      {done && (
                        <span className="text-xs font-medium text-amber-600">
                          تم استرجاع كامل الكمية
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="w-20 shrink-0"
                      min="0"
                      max={remaining}
                      disabled={done}
                      placeholder="0"
                      value={qtys[item.id] || ''}
                      onChange={(e) => setQtys({ ...qtys, [item.id]: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">سبب المرتجع (اختياري)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: عيب في الصنف"
            />
          </div>

          {estimate.total > 0 && (
            <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex justify-between font-semibold">
                <span>قيمة المرتجع</span>
                <span>{money(estimate.total)}</span>
              </div>
              {estimate.invoiceCredit > 0 && (
                <div className="flex justify-between text-xs">
                  <span>يتخصم من المتبقي (الآجل) على الفاتورة</span>
                  <span>{money(estimate.invoiceCredit)}</span>
                </div>
              )}
              {estimate.paidPortion > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span>من المبلغ المدفوع</span>
                    <span>{money(estimate.paidPortion)}</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={refundMode === 'refund'}
                        onChange={() => setRefundMode('refund')}
                      />
                      <span>يترد للعميل</span>
                      <select
                        className="rounded border bg-white px-2 py-1 text-xs"
                        value={methodId}
                        onChange={(e) => {
                          setMethodId(e.target.value);
                          setRefundMode('refund');
                        }}
                      >
                        {methods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nameAr || m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sale.customerId && (
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          className="mt-1"
                          checked={refundMode === 'account'}
                          onChange={() => setRefundMode('account')}
                        />
                        <span>
                          يتخصم من مديونية العميل على فواتير تانية
                          <span className="block text-xs text-gray-500">
                            لو مديونيته أقل من المبلغ، الباقي يترد له {methodName}.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                  {refundMode === 'refund' && (
                    <p className="text-xs text-gray-600">
                      المبلغ المردود هينزل من الخزينة/المتحصلات ({methodName}) في ملخص الوردية
                      والتقارير.
                    </p>
                  )}
                </>
              )}
              <p className="text-[11px] text-gray-500">
                * التقسيم النهائي بيتحسب وقت الحفظ حسب رصيد العميل الفعلي.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
