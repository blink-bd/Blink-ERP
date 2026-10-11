import { useEffect, useState } from 'react';
import { Lock, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useFeature } from '@/contexts/FeaturesContext';
import { usePermissions } from '@/lib/permissions';
import { money, num } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FeatureLocked } from '@/components/ui/feature-locked';

type Tab =
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'profit-loss'
  | 'product-profitability'
  | 'by-cashier'
  | 'by-payment-method'
  | 'inventory-valuation'
  | 'dead-stock'
  | 'sales-heatmap'
  | 'top-customers';

interface TabDef {
  id: Tab;
  label: string;
  advanced?: boolean;
  noDates?: boolean;
}

const TABS: TabDef[] = [
  { id: 'sales', label: 'المبيعات' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'expenses', label: 'المصروفات' },
  { id: 'profit-loss', label: 'الأرباح والخسائر', advanced: true },
  { id: 'product-profitability', label: 'ربحية المنتجات', advanced: true },
  { id: 'by-cashier', label: 'أداء الموظفين', advanced: true },
  { id: 'by-payment-method', label: 'طرق الدفع', advanced: true },
  { id: 'inventory-valuation', label: 'تقييم المخزون', advanced: true, noDates: true },
  { id: 'dead-stock', label: 'البضاعة الراكدة', advanced: true, noDates: true },
  { id: 'sales-heatmap', label: 'أوقات الذروة', advanced: true },
  { id: 'top-customers', label: 'أفضل العملاء', advanced: true },
];

const endpoint = (t: Tab) => {
  if (['sales', 'purchases', 'expenses', 'profit-loss'].includes(t)) return `/reports/${t}`;
  return `/reports/advanced/${t}`;
};

const Card = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="rounded-lg bg-white p-4 shadow">
    <p className="text-sm text-gray-500">{label}</p>
    <p className={`text-2xl font-bold ${tone || ''}`}>{value}</p>
  </div>
);

const Th = ({ children }: { children?: React.ReactNode }) => (
  <th className="p-3 text-right">{children}</th>
);
const Td = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <td className={`p-3 ${className}`}>{children}</td>
);

function Table({
  head,
  children,
  empty,
}: {
  head: string[];
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {head.map((h) => (
              <Th key={h}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="p-6 text-center text-gray-400">
                لا توجد بيانات في هذه الفترة
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const profitTone = (v: number) => (v < 0 ? 'text-red-600' : 'text-green-600');

export function ReportsPage() {
  const advancedEnabled = useFeature('advanced_reports');
  const { has } = usePermissions();
  const canAdvanced = has('advanced_reports.view');
  const [tab, setTab] = useState<Tab>('sales');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(60);
  const [report, setReport] = useState<any>(null);
  const [reportTab, setReportTab] = useState<Tab | null>(null);
  const [loading, setLoading] = useState(false);

  const current = TABS.find((t) => t.id === tab)!;
  const locked = current.advanced && (!advancedEnabled || !canAdvanced);

  const runReport = async (which: Tab = tab) => {
    const def = TABS.find((t) => t.id === which)!;
    if (def.advanced && (!advancedEnabled || !canAdvanced)) {
      setReport(null);
      setReportTab(null);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, unknown> = def.noDates ? {} : { startDate, endDate };
      if (which === 'dead-stock') params.days = days;
      const res = await api.get(endpoint(which), { params });
      setReport(res.data.data);
      setReportTab(which);
    } catch {
      setReport(null);
      setReportTab(null);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    runReport(tab);
  }, [tab, advancedEnabled]);

  const r = reportTab === tab ? report : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">التقارير</h1>
        {r && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="me-2 h-4 w-4" /> طباعة
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {TABS.map((t) => {
          const isLocked = t.advanced && (!advancedEnabled || !canAdvanced);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-primary text-white' : 'border bg-white'} ${isLocked ? 'opacity-60' : ''}`}
            >
              {isLocked && <Lock className="h-3 w-3" />} {t.label}
            </button>
          );
        })}
      </div>

      {locked ? (
        !advancedEnabled ? (
          <FeatureLocked
            title="التقارير المتقدمة"
            message="الأرباح والخسائر، ربحية كل منتج، أداء الموظفين، تقييم المخزون، البضاعة الراكدة وأوقات الذروة — متاحة في الباقة الأعلى. تواصل مع الإدارة لتفعيلها."
          />
        ) : (
          <FeatureLocked
            title="التقارير المتقدمة"
            message="ليس لديك صلاحية عرض التقارير المتقدمة."
          />
        )
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg bg-white p-5 shadow print:hidden">
            {!current.noDates && (
              <>
                <div>
                  <Label>من تاريخ</Label>
                  <Input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>إلى تاريخ</Label>
                  <Input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
            {tab === 'dead-stock' && (
              <div>
                <Label>ماتباعش من (يوم)</Label>
                <Input
                  type="number"
                  min={7}
                  max={730}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </div>
            )}
            <Button onClick={() => runReport()} disabled={loading}>
              {loading ? 'جاري التحميل...' : 'تحديث'}
            </Button>
          </div>

          {r && <ReportBody tab={tab} r={r} />}
        </>
      )}
    </div>
  );
}

function ReportBody({ tab, r }: { tab: Tab; r: any }) {
  switch (tab) {
    case 'sales':
      return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card label="عدد الفواتير" value={num(r.summary.salesCount)} />
          <Card label="إجمالي المبيعات" value={money(r.summary.totalSales)} />
          <Card label="إجمالي الربح" value={money(r.summary.grossProfit)} tone="text-green-600" />
          <Card label="إجمالي الضريبة" value={money(r.summary.totalTax)} />
        </div>
      );

    case 'purchases':
      return (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card label="عدد أوامر الشراء" value={num(r.summary.purchasesCount)} />
            <Card label="إجمالي المشتريات" value={money(r.summary.totalPurchases)} />
            <Card
              label="متبقي للموردين"
              value={money(r.summary.totalRemaining)}
              tone="text-orange-600"
            />
          </div>
          <Table head={['المورد', 'عدد الفواتير', 'الإجمالي']} empty={!r.bySupplier.length}>
            {r.bySupplier.map((s: any) => (
              <tr key={s.supplierId} className="border-t">
                <Td>{s.supplierName}</Td>
                <Td>{s.purchasesCount}</Td>
                <Td className="font-medium">{money(s.total)}</Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'expenses':
      return (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card label="عدد المصروفات" value={num(r.summary.expensesCount)} />
            <Card label="الإجمالي" value={money(r.summary.total)} tone="text-red-600" />
          </div>
          <Table head={['الفئة', 'العدد', 'الإجمالي']} empty={!r.byCategory.length}>
            {r.byCategory.map((c: any, i: number) => (
              <tr key={i} className="border-t">
                <Td>{c.category}</Td>
                <Td>{c.count}</Td>
                <Td className="font-medium">{money(c.total)}</Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'profit-loss': {
      const rows: [string, number, string?][] = [
        ['إجمالي المبيعات (بعد الخصم)', r.revenue.grossSales],
        ['(-) المرتجعات', -Math.abs(r.revenue.returns), 'text-red-600'],
        ['صافي المبيعات', r.revenue.total, 'font-semibold'],
        ['(-) تكلفة البضاعة المباعة', -Math.abs(r.cogs), 'text-red-600'],
        ['مجمل الربح', r.grossProfit, 'font-semibold'],
        ['(-) المصروفات', -Math.abs(r.expenses.total), 'text-red-600'],
        ['صافي الربح', r.netProfit, `font-bold text-lg ${profitTone(r.netProfit)}`],
      ];
      return (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="صافي المبيعات" value={money(r.revenue.total)} />
            <Card
              label="مجمل الربح"
              value={money(r.grossProfit)}
              tone={profitTone(r.grossProfit)}
            />
            <Card label="هامش مجمل الربح" value={`${num(r.grossProfitMargin, 1)}%`} />
            <Card label="صافي الربح" value={money(r.netProfit)} tone={profitTone(r.netProfit)} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-5 shadow">
              <h3 className="mb-3 font-semibold">قائمة الدخل ({num(r.revenue.invoices)} فاتورة)</h3>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map(([label, value, cls]) => (
                    <tr key={label} className="border-t">
                      <td className={`p-2 ${cls || ''}`}>{label}</td>
                      <td className={`p-2 text-left ${cls || ''}`} dir="ltr">
                        {money(value)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="p-2 text-gray-500">خصومات ممنوحة (مخصومة بالفعل من المبيعات)</td>
                    <td className="p-2 text-left text-gray-500" dir="ltr">
                      {money(r.revenue.discounts)}
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-gray-500">هامش صافي الربح</td>
                    <td className="p-2 text-left text-gray-500" dir="ltr">
                      {num(r.netProfitMargin, 1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-white p-5 shadow">
              <h3 className="mb-3 font-semibold">المصروفات حسب الفئة</h3>
              <table className="w-full text-sm">
                <tbody>
                  {r.expenses.byCategory.map((c: any) => (
                    <tr key={c.category} className="border-t">
                      <td className="p-2">{c.category}</td>
                      <td className="p-2 text-left" dir="ltr">
                        {money(c.total)}
                      </td>
                    </tr>
                  ))}
                  {!r.expenses.byCategory.length && (
                    <tr>
                      <td className="p-4 text-center text-gray-400">لا توجد مصروفات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    case 'product-profitability':
      return (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="الإيراد" value={money(r.totals.revenue)} />
            <Card label="التكلفة" value={money(r.totals.cost)} />
            <Card label="الربح" value={money(r.totals.profit)} tone={profitTone(r.totals.profit)} />
            <Card
              label="منتجات بتخسر"
              value={num(r.losers.length)}
              tone={r.losers.length ? 'text-red-600' : ''}
            />
          </div>
          <Table
            head={['المنتج', 'القسم', 'الكمية', 'مرتجع', 'الإيراد', 'التكلفة', 'الربح', 'الهامش']}
            empty={!r.items.length}
          >
            {r.items.map((i: any) => (
              <tr key={i.productId} className={`border-t ${i.profit < 0 ? 'bg-red-50' : ''}`}>
                <Td>
                  {i.productName}
                  <div className="text-xs text-gray-400" dir="ltr">
                    {i.sku}
                  </div>
                </Td>
                <Td>{i.category || '—'}</Td>
                <Td>{num(i.quantity, 3)}</Td>
                <Td>{i.returnedQuantity ? num(i.returnedQuantity, 3) : '—'}</Td>
                <Td>{money(i.revenue)}</Td>
                <Td>{money(i.cost)}</Td>
                <Td className={`font-medium ${profitTone(i.profit)}`}>{money(i.profit)}</Td>
                <Td>{num(i.margin, 1)}%</Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'by-cashier':
      return (
        <Table
          head={[
            'الموظف',
            'الفواتير',
            'الإجمالي',
            'متوسط الفاتورة',
            'الربح',
            'الخصومات',
            'المرتجعات',
            'الإلغاءات',
          ]}
          empty={!r.items.length}
        >
          {r.items.map((i: any) => (
            <tr key={i.userId || i.name} className="border-t">
              <Td>
                {i.name}
                <div className="text-xs text-gray-400" dir="ltr">
                  {i.email}
                </div>
              </Td>
              <Td>{num(i.salesCount)}</Td>
              <Td className="font-medium">{money(i.total)}</Td>
              <Td>{money(i.averageTicket)}</Td>
              <Td className="text-green-600">{money(i.grossProfit)}</Td>
              <Td>{money(i.discounts)}</Td>
              <Td>{i.returnsCount ? `${i.returnsCount} (${money(i.returnsTotal)})` : '—'}</Td>
              <Td className={i.cancelledCount ? 'text-red-600' : ''}>
                {i.cancelledCount ? `${i.cancelledCount} (${money(i.cancelledTotal)})` : '—'}
              </Td>
            </tr>
          ))}
        </Table>
      );

    case 'by-payment-method':
      return (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card label="إجمالي المتحصلات" value={money(r.total)} />
          </div>
          <Table
            head={['طريقة الدفع', 'عدد العمليات', 'الإجمالي', 'النسبة']}
            empty={!r.items.length}
          >
            {r.items.map((i: any) => (
              <tr key={i.methodId} className="border-t">
                <Td>{i.name}</Td>
                <Td>{num(i.count)}</Td>
                <Td className="font-medium">{money(i.total)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded bg-gray-100">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${Math.min(100, i.share)}%` }}
                      />
                    </div>
                    {num(i.share, 1)}%
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'inventory-valuation':
      return (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="إجمالي الكميات" value={num(r.totals.quantity, 3)} />
            <Card label="القيمة بالتكلفة" value={money(r.totals.costValue)} />
            <Card label="القيمة بسعر البيع" value={money(r.totals.retailValue)} />
            <Card label="ربح متوقع" value={money(r.totals.potentialProfit)} tone="text-green-600" />
          </div>
          <h3 className="mb-2 font-semibold">حسب المخزن</h3>
          <Table
            head={['المخزن', 'أصناف برصيد', 'الكمية', 'بالتكلفة', 'بسعر البيع', 'ربح متوقع']}
            empty={!r.byWarehouse.length}
          >
            {r.byWarehouse.map((w: any) => (
              <tr key={w.warehouseId} className="border-t">
                <Td>
                  {w.warehouse}
                  {w.isMain && <span className="ms-2 text-xs text-gray-400">(رئيسي)</span>}
                </Td>
                <Td>{num(w.products)}</Td>
                <Td>{num(w.quantity, 3)}</Td>
                <Td>{money(w.costValue)}</Td>
                <Td>{money(w.retailValue)}</Td>
                <Td className="text-green-600">{money(w.potentialProfit)}</Td>
              </tr>
            ))}
          </Table>
          <h3 className="mb-2 mt-6 font-semibold">حسب القسم</h3>
          <Table
            head={['القسم', 'أصناف برصيد', 'الكمية', 'بالتكلفة', 'بسعر البيع', 'ربح متوقع']}
            empty={!r.byCategory.length}
          >
            {r.byCategory.map((c: any) => (
              <tr key={c.category} className="border-t">
                <Td>{c.category}</Td>
                <Td>{num(c.products)}</Td>
                <Td>{num(c.quantity, 3)}</Td>
                <Td>{money(c.costValue)}</Td>
                <Td>{money(c.retailValue)}</Td>
                <Td className="text-green-600">{money(c.potentialProfit)}</Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'dead-stock':
      return (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card label={`أصناف ماتباعتش من ${r.days} يوم`} value={num(r.count)} />
            <Card
              label="فلوس مجمدة (بالتكلفة)"
              value={money(r.totalValue)}
              tone="text-orange-600"
            />
          </div>
          <Table head={['المنتج', 'القسم', 'الرصيد', 'القيمة', 'آخر بيع']} empty={!r.items.length}>
            {r.items.map((i: any) => (
              <tr key={i.productId} className="border-t">
                <Td>
                  {i.productName}
                  <div className="text-xs text-gray-400" dir="ltr">
                    {i.sku}
                  </div>
                </Td>
                <Td>{i.category || '—'}</Td>
                <Td>{num(i.quantity, 3)}</Td>
                <Td className="font-medium">{money(i.costValue)}</Td>
                <Td>
                  {i.neverSold ? (
                    <span className="text-red-600">لم يُبع أبداً</span>
                  ) : (
                    `من ${i.daysSinceLastSale} يوم`
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      );

    case 'sales-heatmap': {
      const cells: any[] = r.cells;
      const max = Math.max(1, ...cells.map((c) => c.total));
      const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h);
      const hours = Array.from({ length: 24 }, (_, h) => h);
      return (
        <div className="overflow-x-auto rounded-lg bg-white p-5 shadow">
          <p className="mb-3 text-sm text-gray-500">
            قيمة المبيعات بالساعة واليوم (توقيت {r.timezone}). كل ما اللون أغمق كل ما البيع أكتر.
          </p>
          <table className="text-xs" dir="ltr">
            <thead>
              <tr>
                <th></th>
                {hours.map((h) => (
                  <th key={h} className="w-8 p-1 text-center font-normal text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, d) => (
                <tr key={day}>
                  <td className="whitespace-nowrap p-1 pe-2 text-right text-gray-600" dir="rtl">
                    {day}
                  </td>
                  {hours.map((h) => {
                    const c = get(d, h);
                    const intensity = c ? c.total / max : 0;
                    return (
                      <td key={h} className="p-0.5">
                        <div
                          className="h-7 w-7 rounded"
                          title={
                            c
                              ? `${day} ${h}:00 — ${c.count} فاتورة، ${money(c.total)}`
                              : `${day} ${h}:00 — لا مبيعات`
                          }
                          style={{
                            backgroundColor: c
                              ? `rgba(37, 99, 235, ${0.12 + intensity * 0.88})`
                              : '#f3f4f6',
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'top-customers':
      return (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card label="عملاء عليهم فلوس" value={num(r.receivables.customers)} />
            <Card
              label="إجمالي المديونيات"
              value={money(r.receivables.total)}
              tone="text-orange-600"
            />
          </div>
          <Table
            head={[
              'العميل',
              'الموبايل',
              'الفواتير',
              'الإجمالي',
              'الربح',
              'الرصيد الحالي',
              'آخر شراء',
            ]}
            empty={!r.items.length}
          >
            {r.items.map((c: any) => (
              <tr key={c.customerId} className="border-t">
                <Td className="font-medium">{c.name}</Td>
                <Td>
                  <span dir="ltr">{c.phone || '—'}</span>
                </Td>
                <Td>{num(c.salesCount)}</Td>
                <Td>{money(c.total)}</Td>
                <Td className="text-green-600">{money(c.grossProfit)}</Td>
                <Td className={c.balance > 0 ? 'text-orange-600' : ''}>{money(c.balance)}</Td>
                <Td>
                  {c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString('ar-EG') : '—'}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      );
  }
}
