import { Fragment, useCallback, useEffect, useState } from 'react';
import { BadgeDollarSign, Plus, RefreshCw, Wrench, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface Branch {
  id: string;
  name: string;
  isMain: boolean;
  isActive?: boolean;
}

interface MaintenanceForm {
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productName: string;
  productModel: string;
  productSerial: string;
  productNotes: string;
  maintenanceDescription: string;
  partsDescription: string;
  partsCost: string;
  servicePrice: string;
}

const emptyForm: MaintenanceForm = {
  branchId: '',
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  productName: '',
  productModel: '',
  productSerial: '',
  productNotes: '',
  maintenanceDescription: '',
  partsDescription: '',
  partsCost: '0',
  servicePrice: '',
};

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export function MaintenancePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<MaintenanceForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/maintenance', {
        params: {
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59.999`,
          branchIds: selectedBranches.length ? selectedBranches.join(',') : undefined,
        },
      });
      setData(response.data.data);
    } catch {
      toast.error('تعذر تحميل فواتير الصيانة');
    } finally {
      setLoading(false);
    }
  }, [endDate, selectedBranches, startDate]);

  useEffect(() => {
    Promise.all([api.get('/customers'), api.get('/branches')])
      .then(([customerResponse, branchResponse]) => {
        setCustomers(customerResponse.data.data);
        const activeBranches = branchResponse.data.data.filter(
          (branch: Branch) => branch.isActive !== false
        );
        setBranches(activeBranches);
        const mainBranch = activeBranches.find((branch: Branch) => branch.isMain);
        if (mainBranch) setForm((current) => ({ ...current, branchId: mainBranch.id }));
      })
      .catch(() => toast.error('تعذر تحميل بيانات العملاء والفروع'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = (patch: Partial<MaintenanceForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const selectCustomer = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);
    setForm((current) => ({
      ...current,
      customerId,
      customerName: customer?.name || (customerId ? current.customerName : ''),
      customerPhone: customer?.phone || (customerId ? current.customerPhone : ''),
      customerEmail: customer?.email || (customerId ? current.customerEmail : ''),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/maintenance', {
        branchId: form.branchId || undefined,
        customerId: form.customerId || undefined,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || undefined,
        customerEmail: form.customerEmail.trim() || undefined,
        productName: form.productName.trim(),
        productModel: form.productModel.trim() || undefined,
        productSerial: form.productSerial.trim() || undefined,
        productNotes: form.productNotes.trim() || undefined,
        maintenanceDescription: form.maintenanceDescription.trim(),
        partsDescription: form.partsDescription.trim() || undefined,
        partsCost: Number(form.partsCost) || 0,
        servicePrice: Number(form.servicePrice) || 0,
      });
      toast.success('تم حفظ فاتورة الصيانة وربطها بحساب العميل');
      setForm((current) => ({ ...emptyForm, branchId: current.branchId }));
      setShowForm(false);
      await load();
      const customerResponse = await api.get('/customers');
      setCustomers(customerResponse.data.data);
    } catch {
      toast.error('تعذر حفظ فاتورة الصيانة');
    } finally {
      setSaving(false);
    }
  };

  const toggleBranch = (id: string) => {
    setSelectedBranches((current) =>
      current.includes(id) ? current.filter((branchId) => branchId !== id) : [...current, id]
    );
  };

  const invoices = data?.data || [];
  const summary = data?.summary || { count: 0, serviceRevenue: 0, partsCost: 0, profit: 0 };
  const projectedProfit = (Number(form.servicePrice) || 0) - (Number(form.partsCost) || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wrench className="h-6 w-6" /> إدارة الصيانة
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            فواتير صيانة محفوظة ببيانات العميل والمنتج، مع فصل تكلفة القطع عن إيراد الخدمة وربحها.
          </p>
        </div>
        <Button onClick={() => setShowForm((visible) => !visible)}>
          {showForm ? <X className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}
          {showForm ? 'إغلاق النموذج' : 'فاتورة صيانة جديدة'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-5 rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="font-bold">بيانات فاتورة الصيانة</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>الفرع</Label>
              <select
                className="h-10 w-full rounded-md border px-3"
                value={form.branchId}
                onChange={(event) => updateForm({ branchId: event.target.value })}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>اختيار عميل مسجل أو إضافة جديد</Label>
              <select
                className="h-10 w-full rounded-md border px-3"
                value={form.customerId}
                onChange={(event) => selectCustomer(event.target.value)}
              >
                <option value="">إضافة عميل جديد</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `· ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>اسم العميل</Label>
              <Input
                required
                value={form.customerName}
                onChange={(event) => updateForm({ customerName: event.target.value })}
              />
            </div>
            <div>
              <Label>هاتف العميل</Label>
              <Input
                value={form.customerPhone}
                onChange={(event) => updateForm({ customerPhone: event.target.value })}
              />
            </div>
            <div>
              <Label>بريد العميل (اختياري)</Label>
              <Input
                type="email"
                value={form.customerEmail}
                onChange={(event) => updateForm({ customerEmail: event.target.value })}
              />
            </div>
            <div>
              <Label>اسم المنتج</Label>
              <Input
                required
                value={form.productName}
                onChange={(event) => updateForm({ productName: event.target.value })}
                placeholder="مثال: هاتف Samsung A54"
              />
            </div>
            <div>
              <Label>الموديل</Label>
              <Input
                value={form.productModel}
                onChange={(event) => updateForm({ productModel: event.target.value })}
              />
            </div>
            <div>
              <Label>الرقم التسلسلي / IMEI</Label>
              <Input
                value={form.productSerial}
                onChange={(event) => updateForm({ productSerial: event.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات حالة المنتج</Label>
              <Input
                value={form.productNotes}
                onChange={(event) => updateForm({ productNotes: event.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label>وصف أعمال الصيانة</Label>
              <textarea
                required
                className="min-h-24 w-full rounded-md border p-3"
                value={form.maintenanceDescription}
                onChange={(event) => updateForm({ maintenanceDescription: event.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label>القطعة التي تم شراؤها / تفاصيل القطع (اختياري)</Label>
              <Input
                value={form.partsDescription}
                onChange={(event) => updateForm({ partsDescription: event.target.value })}
                placeholder="مثال: شاشة بديلة أصلية"
              />
            </div>
            <div>
              <Label>تكلفة قطع الصيانة</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.partsCost}
                onChange={(event) => updateForm({ partsCost: event.target.value })}
              />
            </div>
            <div>
              <Label>سعر بيع خدمة الصيانة</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.servicePrice}
                onChange={(event) => updateForm({ servicePrice: event.target.value })}
              />
            </div>
            <div className="rounded-md border bg-green-50 p-3">
              <div className="text-sm text-gray-600">الربح التقديري للصيانة</div>
              <div
                className={`mt-1 text-xl font-bold ${projectedProfit < 0 ? 'text-red-700' : 'text-green-700'}`}
              >
                {money(projectedProfit)}
              </div>
              <div className="text-xs text-gray-500">سعر الخدمة − تكلفة القطع</div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ وإصدار فاتورة الصيانة'}
            </Button>
          </div>
        </form>
      )}

      <section className="space-y-4 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
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
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث التقرير
          </Button>
        </div>
        {branches.length > 1 && (
          <div className="flex flex-wrap gap-3 border-t pt-3">
            <span className="text-sm font-medium">الفروع:</span>
            {branches.map((branch) => (
              <label key={branch.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedBranches.includes(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                />{' '}
                {branch.name}
              </label>
            ))}
            <span className="text-xs text-gray-500">بدون تحديد يعرض كل الفروع.</span>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="عدد فواتير الصيانة" value={Number(summary.count).toLocaleString('ar-EG')} />
        <Metric title="إيراد خدمة الصيانة" value={money(summary.serviceRevenue)} />
        <Metric title="تكلفة قطع الصيانة" value={money(summary.partsCost)} tone="red" />
        <Metric
          title="ربح الصيانة"
          value={money(summary.profit)}
          tone={Number(summary.profit) < 0 ? 'red' : 'green'}
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
          <BadgeDollarSign className="h-5 w-5 text-primary" /> فواتير الصيانة
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">رقم الفاتورة / التاريخ</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-right">المنتج</th>
                <th className="p-3 text-right">إيراد الخدمة</th>
                <th className="p-3 text-right">تكلفة القطع</th>
                <th className="p-3 text-right">الربح</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    جاري تحميل الفواتير...
                  </td>
                </tr>
              )}
              {!loading && invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    لا توجد فواتير صيانة في الفترة المحددة.
                  </td>
                </tr>
              )}
              {invoices.map((invoice: any) => (
                <Fragment key={invoice.id}>
                  <tr
                    className="border-t cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)
                    }
                  >
                    <td className="p-3">
                      <div className="font-medium">{invoice.invoiceNumber}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(invoice.maintenanceDate).toLocaleString('ar-EG')}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>{invoice.customerName}</div>
                      <div className="text-xs text-gray-500">{invoice.customerPhone || '—'}</div>
                    </td>
                    <td className="p-3">
                      <div>{invoice.productName}</div>
                      <div className="text-xs text-gray-500">
                        {invoice.productModel || invoice.productSerial || '—'}
                      </div>
                    </td>
                    <td className="p-3">{money(invoice.servicePrice)}</td>
                    <td className="p-3">{money(invoice.partsCost)}</td>
                    <td
                      className={`p-3 font-bold ${Number(invoice.profit) < 0 ? 'text-red-700' : 'text-green-700'}`}
                    >
                      {money(invoice.profit)}
                    </td>
                  </tr>
                  {expandedInvoice === invoice.id && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan={6} className="space-y-2 p-4">
                        <div>
                          <strong>وصف الصيانة:</strong> {invoice.maintenanceDescription}
                        </div>
                        <div>
                          <strong>تفاصيل القطع:</strong> {invoice.partsDescription || '—'}
                        </div>
                        <div>
                          <strong>بيانات المنتج:</strong> {invoice.productNotes || '—'}{' '}
                          {invoice.productSerial ? ` · IMEI/Serial: ${invoice.productSerial}` : ''}
                        </div>
                        <div>
                          <strong>بيانات العميل:</strong> {invoice.customerName} ·{' '}
                          {invoice.customerPhone || '—'} · {invoice.customerEmail || '—'}
                        </div>
                        <div>
                          <strong>الفرع:</strong>{' '}
                          {branches.find((branch) => branch.id === invoice.branchId)?.name || '—'}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
  tone?: 'default' | 'green' | 'red';
}) {
  const textColor =
    tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-900';
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className={`mt-2 text-xl font-bold ${textColor}`}>{value}</div>
    </div>
  );
}
