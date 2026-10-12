import { Fragment, useCallback, useEffect, useState } from 'react';
import { Paperclip, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InvoiceAttachments } from '@/components/InvoiceAttachments';
import toast from 'react-hot-toast';

interface Sale {
  id: string;
  saleNumber: string;
  saleDate: string;
  total: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
}

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [attachmentsFor, setAttachmentsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">رقم الفاتورة</th>
              <th className="p-3 text-right">التاريخ</th>
              <th className="p-3 text-right">الإجمالي</th>
              <th className="p-3 text-right">المدفوع</th>
              <th className="p-3 text-right">حالة الدفع</th>
              <th className="p-3 text-right">إثبات الدفع</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  جاري التحميل...
                </td>
              </tr>
            )}
            {!loading && sales.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
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
                  <td className="p-3">{Number(sale.total).toFixed(2)}</td>
                  <td className="p-3">{Number(sale.paidAmount).toFixed(2)}</td>
                  <td className="p-3">
                    {sale.paymentStatus}
                    {sale.status === 'cancelled' ? ' · ملغاة' : ''}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAttachmentsFor(attachmentsFor === sale.id ? null : sale.id)}
                    >
                      <Paperclip className="ml-1 h-4 w-4" /> مرفقات
                    </Button>
                  </td>
                </tr>
                {attachmentsFor === sale.id && (
                  <tr className="border-t">
                    <td colSpan={6} className="p-3">
                      <InvoiceAttachments entityType="sales" invoiceId={sale.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
