import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, FileText } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  balance: number;
  previousBalance: number;
  customerType: string;
}

type CustomerForm = { id: string; name: string; phone: string; email: string; previousBalance: string };
const emptyForm: CustomerForm = { id: '', name: '', phone: '', email: '', previousBalance: '' };

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [statementFor, setStatementFor] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [methods, setMethods] = useState<any[]>([]);

  const [returnSale, setReturnSale] = useState<any>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returning, setReturning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', { params: { search } });
      setCustomers(res.data.data);
      setTotalOwed(res.data.meta?.totalOwed || 0);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    api.get('/sales/payment-methods').then((r) => setMethods(r.data.data)).catch(() => {});
  }, []);

  const openCreate = () => { setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (customer: Customer) => {
    setForm({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      previousBalance: String(customer.previousBalance || 0),
    });
    setShowForm(true);
  };

  const submitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingChanged = !!form.id && Number(form.previousBalance || 0) !== Number(customers.find((c) => c.id === form.id)?.previousBalance || 0);
    let openingBalanceReason = '';
    if (openingChanged) {
      if (!window.confirm('سيتم تسجيل تعديل الرصيد الافتتاحي في كشف الحساب. هل تريد المتابعة؟')) return;
      openingBalanceReason = window.prompt('اكتب سبب تعديل الرصيد الافتتاحي:')?.trim() || '';
      if (!openingBalanceReason) {
        toast.error('يجب كتابة سبب تعديل الرصيد الافتتاحي');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        previousBalance: Number(form.previousBalance) || 0,
      };
      if (openingChanged) payload.openingBalanceReason = openingBalanceReason;
      if (form.id) {
        await api.put(`/customers/${form.id}`, payload);
        toast.success('تم تحديث بيانات العميل بنجاح');
      } else {
        await api.post('/customers', payload);
        toast.success('تم إضافة العميل بنجاح');
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      load();
    } finally {
      setSaving(false);
    }
  };

  const removeCustomer = async (customer: Customer) => {
    if (!window.confirm(`هل أنت متأكد من حذف العميل «${customer.name}»؟ سيتم الاحتفاظ بالفواتير السابقة.`)) return;
    await api.delete(`/customers/${customer.id}`);
    toast.success('تم حذف العميل');
    load();
  };

  const openStatement = async (c: Customer) => {
    setStatementFor(c);
    const res = await api.get(`/customers/${c.id}/statement`);
    setStatement(res.data.data);
  };

  const collectPayment = async () => {
    if (!statementFor || !Number(payAmount)) return;
    setPaying(true);
    try {
      await api.post(`/customers/${statementFor.id}/payments`, {
        amount: Number(payAmount),
        methodId: methods.find((m) => m.code === 'cash')?.id || methods[0]?.id,
      });
      toast.success('تم تسجيل السداد بنجاح');
      setPayAmount('');
      await openStatement(statementFor);
      load();
    } finally { setPaying(false); }
  };

  const openReturnById = async (saleId: string) => {
    const res = await api.get(`/sales/${saleId}`);
    setReturnSale(res.data.data);
    setReturnQtys({});
  };

  const submitReturn = async () => {
    if (!returnSale) return;
    const items = Object.entries(returnQtys)
      .filter(([, q]) => Number(q) > 0)
      .map(([saleItemId, q]) => ({ saleItemId, quantity: Number(q) }));
    if (items.length === 0) { toast.error('حدد كمية صنف واحد على الأقل للاسترجاع'); return; }
    setReturning(true);
    try {
      await api.post(`/sales/${returnSale.id}/return`, { items, reason: 'استرجاع من كشف حساب العميل' });
      toast.success('تم الاسترجاع وإعادة المنتج للمخزون وتعديل رصيد العميل بنجاح');
      setReturnSale(null);
      if (statementFor) await openStatement(statementFor);
      load();
    } finally { setReturning(false); }
  };

  const exportPdf = () => {
    const rows = customers.map((c) => `<tr><td>${c.name}</td><td>${c.phone || '-'}</td><td>${Number(c.balance).toFixed(2)}</td></tr>`).join('');
    const html = `<html dir="rtl"><head><meta charset="utf-8"><title>كشف العملاء</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f0f0f0}h1{font-size:20px}.total{font-size:16px;font-weight:bold;margin-top:12px}</style></head><body><h1>كشف حساب العملاء</h1><p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar')}</p><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>المبلغ المستحق</th></tr></thead><tbody>${rows}</tbody></table><p class="total">إجمالي المبلغ المستحق على كل العملاء: ${totalOwed.toFixed(2)}</p><script>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    w?.document.write(html);
    w?.document.close();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">العملاء</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf}><FileText className="h-4 w-4 ml-2" />تصدير PDF</Button>
          <Button onClick={showForm ? () => setShowForm(false) : openCreate}>
            {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
            {showForm ? 'إلغاء' : 'إضافة عميل'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow px-5 py-3 mb-4 inline-block">
        <span className="text-sm text-gray-500 ml-2">إجمالي المستحق من كل العملاء:</span>
        <span className="text-xl font-bold text-orange-600">{totalOwed.toFixed(2)}</span>
      </div>

      {showForm && (
        <form onSubmit={submitCustomer} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><Label>اسم العميل</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>الرصيد الافتتاحي</Label><Input type="number" min="0" step="0.01" value={form.previousBalance} onChange={(e) => setForm({ ...form, previousBalance: e.target.value })} /></div>
          {form.id && <p className="sm:col-span-2 lg:col-span-4 text-xs text-gray-500">تعديل الرصيد بعد التسجيل الأول يحتاج تأكيداً وسبباً، وسيظهر كسطر مستقل في كشف الحساب.</p>}
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'حفظ العميل'}</Button></div>
        </form>
      )}

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." />
      </form>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-right p-3">الاسم</th><th className="text-right p-3">الهاتف</th><th className="text-right p-3">البريد</th><th className="text-right p-3">الرصيد المستحق</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && customers.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا يوجد عملاء بعد</td></tr>}
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.name}</td><td className="p-3 text-gray-500">{c.phone || '-'}</td><td className="p-3 text-gray-500">{c.email || '-'}</td>
                <td className={`p-3 font-medium ${Number(c.balance) > 0 ? 'text-red-600' : ''}`}>{Number(c.balance).toFixed(2)}</td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openStatement(c)}>كشف الحساب</Button>
                  <Button size="icon" variant="ghost" title="تعديل" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="حذف" onClick={() => removeCustomer(c)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {statementFor && statement && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStatementFor(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">كشف حساب: {statementFor.name}</h2><Button size="icon" variant="ghost" onClick={() => setStatementFor(null)}><X className="h-4 w-4" /></Button></div>
            <table className="w-full min-w-[640px] text-sm mb-4">
              <thead><tr className="border-b"><th className="text-right p-2">التاريخ</th><th className="text-right p-2">البيان</th><th className="text-right p-2">مدين</th><th className="text-right p-2">دائن</th><th className="text-right p-2">الرصيد</th><th className="p-2"></th></tr></thead>
              <tbody>{statement.entries.map((entry: any, i: number) => <tr key={i} className="border-b">
                <td className="p-2">{new Date(entry.date).toLocaleDateString('ar')}</td><td className="p-2">{entry.description} {entry.referenceNumber}</td>
                <td className="p-2">{entry.debit ? Number(entry.debit).toFixed(2) : '-'}</td><td className="p-2">{entry.credit ? Number(entry.credit).toFixed(2) : '-'}</td><td className="p-2 font-medium">{Number(entry.balance).toFixed(2)}</td>
                <td className="p-2">{entry.type === 'sale' && <Button size="sm" variant="outline" onClick={() => openReturnById(entry.id)}>استرجاع</Button>}</td>
              </tr>)}</tbody>
            </table>
            <div className="flex items-center justify-between bg-gray-50 rounded p-3 mb-4"><span className="font-bold">الرصيد الحالي المستحق</span><span className="text-xl font-bold text-red-600">{Number(statement.currentBalance).toFixed(2)}</span></div>
            <div className="flex gap-2 items-end border-t pt-4"><div className="flex-1"><Label>سداد مبلغ</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" /></div><Button onClick={collectPayment} disabled={paying || !payAmount}>{paying ? 'جاري الحفظ...' : 'تسجيل السداد'}</Button></div>
          </div>
        </div>
      )}

      {returnSale && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setReturnSale(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">استرجاع من فاتورة {returnSale.saleNumber}</h2><p className="text-xs text-gray-400">حدد الكمية المطلوب استرجاعها لكل صنف</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">{returnSale.items?.map((it: any) => <div key={it.id} className="flex items-center justify-between border-b pb-2"><div><p className="text-sm">{it.productName}</p><p className="text-xs text-gray-400">الكمية المباعة: {it.quantity} — السعر: {Number(it.unitPrice).toFixed(2)}</p></div><Input type="number" className="w-20" min="0" max={it.quantity} value={returnQtys[it.id] || ''} onChange={(e) => setReturnQtys({ ...returnQtys, [it.id]: e.target.value })} /></div>)}</div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReturnSale(null)}>إلغاء</Button><Button onClick={submitReturn} disabled={returning}>{returning ? 'جاري التنفيذ...' : 'تأكيد الاسترجاع'}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
