import { useCallback, useEffect, useState } from 'react';
import { BarChart3, CheckSquare, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { formatDateTime, daysAgoKey, todayKey } from '@/lib/datetime';

type DetailType =
  'sales' | 'purchases' | 'returns' | 'maintenance' | 'expenses' | 'customers' | 'suppliers';

interface Branch {
  id: string;
  name: string;
  code: string;
  isMain: boolean;
  isActive?: boolean;
}

const detailTabs: Array<{ id: DetailType; title: string }> = [
  { id: 'sales', title: 'المبيعات' },
  { id: 'purchases', title: 'المشتريات' },
  { id: 'returns', title: 'المرتجعات' },
  { id: 'maintenance', title: 'الصيانة' },
  { id: 'expenses', title: 'المصروفات' },
  { id: 'customers', title: 'أرصدة العملاء' },
  { id: 'suppliers', title: 'أرصدة الموردين' },
];

const currency = (value: unknown) =>
  `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dateText = (value: string) => (value ? formatDateTime(value) : '—');

export function BranchReportsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(
    daysAgoKey(30)
  );
  const [endDate, setEndDate] = useState(todayKey());
  const [report, setReport] = useState<any>(null);
  const [detailType, setDetailType] = useState<DetailType>('sales');
  const [loading, setLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(true);

  useEffect(() => {
    api
      .get('/branches')
      .then((response) =>
        setBranches(response.data.data.filter((branch: Branch) => branch.isActive !== false))
      )
      .catch(() => toast.error('تعذر تحميل قائمة الفروع'))
      .finally(() => setBranchesLoading(false));
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/reports/branches', {
        params: {
          branchIds: selectedBranches.length ? selectedBranches.join(',') : undefined,
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59.999`,
        },
      });
      setReport(response.data.data);
    } catch {
      toast.error('تعذر إنشاء تقرير الفروع');
    } finally {
      setLoading(false);
    }
  }, [endDate, selectedBranches, startDate]);

  useEffect(() => {
    if (!branchesLoading && branches.length) runReport();
  }, [branchesLoading, branches.length, runReport]);

  const toggleBranch = (id: string) => {
    setSelectedBranches((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };
  const selectAll = () => setSelectedBranches(branches.map((branch) => branch.id));
  const clearSelection = () => setSelectedBranches([]);

  const summary = report?.summary;
  const details = report?.details?.[detailType] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6" /> تقارير الفروع
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            قارن مؤشرات كل فرع أو اعرض إجماليات مجموعة فروع للفترة المحددة.
          </p>
        </div>
        <Button onClick={() => runReport()} disabled={loading || branchesLoading}>
          <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'جاري التحديث...' : 'تحديث التقرير'}
        </Button>
      </div>

      <section className="space-y-4 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">الفروع المشمولة</h2>
            <p className="mt-1 text-xs text-gray-500">عدم تحديد فروع يعرض جميع الفروع النشطة.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAll} disabled={!branches.length}>
              <CheckSquare className="ml-1 h-4 w-4" /> تحديد الكل
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              مسح التحديد
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {branches.map((branch) => (
            <label
              key={branch.id}
              className="flex cursor-pointer items-center gap-2 rounded border p-2 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedBranches.includes(branch.id)}
                onChange={() => toggleBranch(branch.id)}
              />
              <span>{branch.name}</span>
              {branch.isMain && <span className="text-xs text-gray-400">(رئيسي)</span>}
            </label>
          ))}
          {!branchesLoading && branches.length === 0 && (
            <p className="text-sm text-gray-500">لا توجد فروع نشطة.</p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <div>
            <Label>من تاريخ</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div>
            <Label>إلى تاريخ</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="pb-2 text-sm text-gray-500">
            الفروع: {selectedBranches.length ? `${selectedBranches.length} محددة` : 'كل الفروع'}
          </div>
        </div>
      </section>

      {loading && !report ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-500">
          جاري إنشاء التقرير...
        </div>
      ) : (
        report && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                title="صافي المبيعات بعد المرتجعات"
                value={currency(summary.sales - summary.returns)}
              />
              <Metric title="المشتريات" value={currency(summary.purchases)} />
              <Metric title="المصروفات" value={currency(summary.expenses)} tone="red" />
              <Metric title="إجمالي المرتجعات" value={currency(summary.returns)} tone="amber" />
              <Metric title="إيراد الصيانة" value={currency(summary.maintenanceRevenue)} />
              <Metric
                title="تكلفة قطع الصيانة"
                value={currency(summary.maintenancePartsCost)}
                tone="red"
              />
              <Metric
                title="ربح الصيانة"
                value={currency(summary.maintenanceProfit)}
                tone="green"
              />
              <Metric title="الربح الإجمالي" value={currency(summary.grossProfit)} tone="green" />
              <Metric title="الربح الصافي" value={currency(summary.netProfit)} tone="green" />
              <Metric title="أرصدة العملاء" value={currency(summary.receivables)} />
              <Metric title="أرصدة الموردين" value={currency(summary.payables)} />
              <Metric title="قيمة المخزون" value={currency(summary.inventoryValue)} />
              <Metric
                title="كمية المخزون"
                value={Number(summary.inventoryQuantity || 0).toLocaleString('ar-EG')}
              />
            </div>

            <section className="overflow-hidden rounded-lg border bg-white">
              <div className="border-b px-4 py-3 font-semibold">مقارنة الفروع</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-right">الفرع</th>
                      <th className="p-3 text-right">المبيعات</th>
                      <th className="p-3 text-right">المرتجعات</th>
                      <th className="p-3 text-right">المشتريات</th>
                      <th className="p-3 text-right">إيراد الصيانة</th>
                      <th className="p-3 text-right">ربح الصيانة</th>
                      <th className="p-3 text-right">المصروفات</th>
                      <th className="p-3 text-right">الربح الصافي</th>
                      <th className="p-3 text-right">العملاء</th>
                      <th className="p-3 text-right">الموردون</th>
                      <th className="p-3 text-right">المخزون</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.branches.map((branch: any) => (
                      <tr key={branch.id} className="border-t">
                        <td className="p-3 font-medium">
                          {branch.name}
                          {branch.isMain ? ' · رئيسي' : ''}
                        </td>
                        <td className="p-3">{currency(branch.sales.total)}</td>
                        <td className="p-3">{currency(branch.returns.total)}</td>
                        <td className="p-3">{currency(branch.purchases.total)}</td>
                        <td className="p-3">{currency(branch.maintenance.revenue)}</td>
                        <td className="p-3">{currency(branch.maintenance.profit)}</td>
                        <td className="p-3">{currency(branch.expenses.total)}</td>
                        <td className="p-3 font-semibold">{currency(branch.profit.net)}</td>
                        <td className="p-3">{currency(branch.accounts.receivables)}</td>
                        <td className="p-3">{currency(branch.accounts.payables)}</td>
                        <td className="p-3">{currency(branch.inventory.value)}</td>
                      </tr>
                    ))}
                    {report.branches.length === 0 && (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-gray-500">
                          لا توجد فروع ضمن هذا الاختيار.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-white">
              <div className="flex flex-wrap gap-2 border-b p-3">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`rounded-md px-3 py-2 text-sm ${detailType === tab.id ? 'bg-primary text-white' : 'border bg-white'}`}
                    onClick={() => setDetailType(tab.id)}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <BranchDetailTable type={detailType} rows={details} />
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  tone = 'default',
}: {
  title: string;
  value: string;
  tone?: 'default' | 'green' | 'red' | 'amber';
}) {
  const color =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'red'
        ? 'text-red-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : 'text-gray-900';
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function BranchDetailTable({ type, rows }: { type: DetailType; rows: any[] }) {
  const headings: Record<DetailType, string[]> = {
    sales: ['الفرع', 'رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي', 'المدفوع'],
    purchases: ['الفرع', 'رقم أمر الشراء', 'المورد', 'التاريخ', 'الإجمالي', 'المدفوع'],
    returns: [
      'الفرع',
      'رقم المرتجع',
      'فاتورة البيع',
      'التاريخ',
      'الإجمالي',
      'خصم من الآجل',
      'مردود للعميل',
      'الحالة',
    ],
    maintenance: [
      'الفرع',
      'رقم فاتورة الصيانة',
      'العميل / المنتج',
      'وصف الصيانة',
      'التاريخ',
      'إيراد الخدمة',
      'تكلفة القطع',
      'الربح',
    ],
    expenses: ['الفرع', 'رقم المصروف', 'البيان', 'التاريخ', 'المبلغ'],
    customers: ['الفرع', 'العميل', 'الهاتف', 'الرصيد الحالي'],
    suppliers: ['الفرع', 'المورد', 'الهاتف', 'الرصيد الحالي'],
  };
  if (!rows.length)
    return (
      <div className="p-8 text-center text-sm text-gray-500">لا توجد تفاصيل لهذا الاختيار.</div>
    );

  return (
    <table className="w-full min-w-[650px] text-sm">
      <thead className="bg-gray-50">
        <tr>
          {headings[type].map((heading) => (
            <th key={heading} className="p-3 text-right">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id || `${row.branchId}-${index}`} className="border-t">
            <td className="p-3">{row.branchName}</td>
            {type === 'sales' && (
              <>
                <td className="p-3">{row.number}</td>
                <td className="p-3">{row.customerName || 'نقدي'}</td>
                <td className="p-3">{dateText(row.date)}</td>
                <td className="p-3">{currency(row.total)}</td>
                <td className="p-3">{currency(row.paidAmount)}</td>
              </>
            )}
            {type === 'purchases' && (
              <>
                <td className="p-3">{row.number}</td>
                <td className="p-3">{row.supplierName}</td>
                <td className="p-3">{dateText(row.date)}</td>
                <td className="p-3">{currency(row.total)}</td>
                <td className="p-3">{currency(row.paidAmount)}</td>
              </>
            )}
            {type === 'returns' && (
              <>
                <td className="p-3">{row.number}</td>
                <td className="p-3">{row.originalSaleNumber}</td>
                <td className="p-3">{dateText(row.date)}</td>
                <td className="p-3">{currency(row.total)}</td>
                <td className="p-3">
                  {currency(Number(row.invoiceCredit || 0) + Number(row.accountCredit || 0))}
                </td>
                <td className="p-3">{currency(row.refundPaid || 0)}</td>
                <td className="p-3">
                  {row.status === 'pending_inspection'
                    ? 'بانتظار الفحص'
                    : row.status === 'completed'
                      ? 'تم الفحص'
                      : row.status}
                </td>
              </>
            )}
            {type === 'maintenance' && (
              <>
                <td className="p-3">{row.number}</td>
                <td className="p-3">
                  {row.customerName} / {row.productName}
                  {row.source === 'sale_return' && (
                    <span className="mr-1 rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">
                      صيانة مرتجع
                    </span>
                  )}
                </td>
                <td className="p-3">{row.description}</td>
                <td className="p-3">{dateText(row.date)}</td>
                <td className="p-3">{currency(row.servicePrice)}</td>
                <td className="p-3">{currency(row.partsCost)}</td>
                <td className="p-3">{currency(row.profit)}</td>
              </>
            )}
            {type === 'expenses' && (
              <>
                <td className="p-3">{row.number}</td>
                <td className="p-3">{row.description}</td>
                <td className="p-3">{dateText(row.date)}</td>
                <td className="p-3">{currency(row.amount)}</td>
              </>
            )}
            {type === 'customers' && (
              <>
                <td className="p-3">{row.name}</td>
                <td className="p-3">{row.phone || '—'}</td>
                <td className="p-3 font-medium">{currency(row.balance)}</td>
              </>
            )}
            {type === 'suppliers' && (
              <>
                <td className="p-3">{row.name}</td>
                <td className="p-3">{row.phone || '—'}</td>
                <td className="p-3 font-medium">{currency(row.balance)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
