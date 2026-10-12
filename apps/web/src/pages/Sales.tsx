import { Fragment, useCallback, useEffect, useState } from 'react';
import { Paperclip, RotateCcw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InvoiceAttachments } from '@/components/InvoiceAttachments';
import toast from 'react-hot-toast';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { SaleReturnDialog } from '@/components/SaleReturnDialog';
import { useFeature } from '@/contexts/FeaturesContext';
import { usePermissions } from '@/lib/permissions';

interface Sale {
  id: string;
  saleNumber: string;
  saleDate: string;
  total: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
  returnsCount?: number;
  returnedTotal?: number;
  remainingAmount?: number;
  fullyReturned?: boolean;
}

const money = (value: number | string | undefined) => Number(value || 0).toFixed(2);

function statusLabel(sale: Sale): string {
  if (sale.status === 'cancelled') return 'ملغاة';
  if (sale.fullyReturned) return 'مرتجعة بالكامل';
  const remaining = Number(sale.remainingAmount ?? Number(sale.total) - Number(sale.paidAmount));
  if (remaining <= 0.0001) return 'مدفوعة';
  return Number(sale.paidAmount) > 0 ? 'مدفوعة جزئياً' : 'آجل';
}

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [attachmentsFor, setAttachmentsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [returnSaleId, setReturnSaleId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const returnsEnabled = useFeature('returns');
  const dispositionEnabled = useFeature('return_disposition');
  const { has } = usePermissions();
  const canReturn = returnsEnabled && dispositionEnabled && has('sales.return');
  const canReturnSale = (sale: Sale) =>
    canReturn && sale.status === 'completed' && !sale.fullyReturned;

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const response = await api.get('/sales', {
        params: { page: 1, limit: 100, search: term || undefined },
      });
      setSales(response.data.data);
    } catch {
      toast.error('تعذر تحميل فواتير المبيعات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search);
  }, [load, search]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">فواتير المبيعات</h1>
          <p className="mt-1 text-sm text-gray-500">
            عرض الفواتير وإرفاق إثباتات الدفع والتحويلات البنكية.
          </p>
        </div>
        <form className="flex gap-2" onSubmit={submitSearch}>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="رقم الفاتورة"
          />
          <Button type="submit" variant="outline" aria-label="بحث">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* الموبايل: كروت بدل الجدول عشان زرار المرفقات يبان من غير تمرير جانبي */}
      {!isDesktop && (
        <div className="space-y-3">
          {loading && <p className="py-8 text-center text-gray-400">جاري التحميل...</p>}
          {!loading && sales.length === 0 && (
            <p className="py-8 text-center text-gray-400">لا توجد فواتير مبيعات.</p>
          )}
          {sales.map((sale) => (
            <div key={sale.id} className="rounded-lg border bg-white p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{sale.saleNumber}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(sale.saleDate).toLocaleString('ar-EG')}
                  </div>
                </div>
                <div className="text-left">
                  <div className="font-bold">{money(sale.total)}</div>
                  <div className="text-xs text-gray-500">مدفوع {money(sale.paidAmount)}</div>
                  {Number(sale.returnedTotal) > 0 && (
                    <div className="text-xs text-red-600">مرتجع {money(sale.returnedTotal)}</div>
                  )}
                  {Number(sale.remainingAmount) > 0 && (
                    <div className="text-xs text-orange-600">
                      متبقي {money(sale.remainingAmount)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600">{statusLabel(sale)}</span>
                <div className="flex gap-2">
                  {canReturnSale(sale) && (
                    <Button size="sm" variant="outline" onClick={() => setReturnSaleId(sale.id)}>
                      <RotateCcw className="ml-1 h-4 w-4" /> مرتجع
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAttachmentsFor(attachmentsFor === sale.id ? null : sale.id)}
                  >
                    <Paperclip className="ml-1 h-4 w-4" /> مرفقات
                  </Button>
                </div>
              </div>
              {attachmentsFor === sale.id && (
                <div className="mt-3">
                  <InvoiceAttachments entityType="sales" invoiceId={sale.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isDesktop && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">رقم الفاتورة</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">المدفوع</th>
                <th className="p-3 text-right">المرتجع</th>
                <th className="p-3 text-right">المتبقي</th>
                <th className="p-3 text-right">حالة الدفع</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    لا توجد فواتير مبيعات.
                  </td>
                </tr>
              )}
              {sales.map((sale) => (
                <Fragment key={sale.id}>
                  <tr className="border-t">
                    <td className="p-3 font-medium">{sale.saleNumber}</td>
                    <td className="p-3 text-gray-500">
                      {new Date(sale.saleDate).toLocaleString('ar-EG')}
                    </td>
                    <td className="p-3">{money(sale.total)}</td>
                    <td className="p-3">{money(sale.paidAmount)}</td>
                    <td className="p-3 text-red-600">
                      {Number(sale.returnedTotal) > 0 ? money(sale.returnedTotal) : '—'}
                    </td>
                    <td className="p-3">
                      {Number(sale.remainingAmount) > 0 ? money(sale.remainingAmount) : '—'}
                    </td>
                    <td className="p-3">{statusLabel(sale)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {canReturnSale(sale) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReturnSaleId(sale.id)}
                          >
                            <RotateCcw className="ml-1 h-4 w-4" /> مرتجع
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAttachmentsFor(attachmentsFor === sale.id ? null : sale.id)
                          }
                        >
                          <Paperclip className="ml-1 h-4 w-4" /> مرفقات
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {attachmentsFor === sale.id && (
                    <tr className="border-t">
                      <td colSpan={8} className="p-3">
                        <InvoiceAttachments entityType="sales" invoiceId={sale.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SaleReturnDialog
        saleId={returnSaleId}
        onClose={() => setReturnSaleId(null)}
        onDone={() => load(search)}
      />
    </div>
  );
}
