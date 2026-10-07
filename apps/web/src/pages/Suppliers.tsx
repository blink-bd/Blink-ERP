import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Pencil, Trash2, FileText } from 'lucide-react';

interface Supplier {
  id: string; name: string; phone?: string; balance: number; previousBalance: number;
}
const emptyForm = { id: '', name: '', phone: '', previousBalance: '' };

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [settleFor, setSettleFor] = useState<Supplier | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settling, setSettling] = useState(false);
  const [statementFor, setStatementFor] = useState<Supplier | null>(null);
  const [statement, setStatement] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers', { params: { search } });
      setSuppliers(res.data.data);
      setTotalOwed(res.data.meta?.totalOwed || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (supplier: Supplier) => {
    setForm({ id: supplier.id, name: supplier.name, phone: supplier.phone || '', previousBalance: String(supplier.previousBalance || 0) });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const current = form.id ? suppliers.find((s) => s.id === form.id) : undefined;
    const openingChanged = !!current && Number(form.previousBalance || 0) !== Number(current.previousBalance || 0);
    let openingBalanceReason = '';
    if (openingChanged) {
      if (!window.confirm('سيتم تسجيل تعديل الرصيد الافتتاحي في كشف حساب المورد. هل تريد المتابعة؟')) return;
      openingBalanceReason = window.prompt('اكتب سبب تعديل الرصيد الافتتاحي:')?.trim() || '';
      if (!openingBalanceReason) { toast.error('يجب كتابة سبب تعديل الرصيد الافتتاحي'); return; }
    }

    setSaving(true);
    try {
      const payload: any = { name: form.name.trim(), phone: form.phone.trim() || undefined, previousBalance: Number(form.previousBalance) || 0 };
      if (openingChanged) payload.openingBalanceReason = openingBalanceReason;
      if (form.id) {
        await api.put(`/suppliers/${form.id}`, payload);
        toast.success('تم تحديث بيانات المورد بنجاح');
      } else {
        await api.post('/suppliers', payload);
        toast.success('تم إضافة المورد بنجاح');
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      load();
    } finally { setSaving(false); }
  };

  const removeSupplier = async (supplier: Supplier) => {
    if (!window.confirm(`هل أنت متأكد من حذف المورد «${supplier.name}»؟ سيتم الاحتفاظ بأوامر الشراء السابقة.`)) return;
    await api.delete(`/suppliers/${supplier.id}`);
    toast.success('تم حذف المورد');
    load();
  };

  const openStatement = async (supplier: Supplier) => {
    setStatementFor(supplier);
    const response = await api.get(`/suppliers/${supplier.id}/statement`);
    setStatement(response.data.data);
  };

  const settle = async () => {
    if (!settleFor || !Number(settleAmount)) return;
    setSettling(true);
    try {
      await api.post(`/suppliers/${settleFor.id}/settle`, { amount: Number(settleAmount), method: settleMethod });
      toast.success('تم تسجيل السداد بنجاح');
      setSettleFor(null); setSettleAmount('');
      load();
    } finally { setSettling(false); }
  };

  const exportPdf = () => {
    const rows = suppliers.map((s) => `<tr><td>${s.name}</td><td>${s.phone || '-'}</td><td>${Number(s.balance).toFixed(2)}</td></tr>`).join('');
    const html = `<html dir="rtl"><head><meta charset="utf-8"><title>كشف الموردين</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f0f0f0}h1{font-size:20px}.total{font-size:16px;font-weight:bold;margin-top:12px}</style></head><body><h1>كشف حساب الموردين</h1><p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar')}</p><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>المبلغ المستحق له</th></tr></thead><tbody>${rows}</tbody></table><p class="total">إجمالي المستحق لكل الموردين: ${totalOwed.toFixed(2)}</p><script>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    w?.document.write(html);
    w?.document.close();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">الموردون</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPdf}><FileText className="h-4 w-4 ml-2" />تصدير PDF</Button>
          <Button onClick={showForm ? () => setShowForm(false) : openCreate}>{showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}{showForm ? 'إلغاء' : 'إضافة مورد'}</Button>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow px-5 py-3 mb-4 inline-block"><span className="text-sm text-gray-500 ml-2">إجمالي المستحق عليّ لكل الموردين:</span><span className="text-xl font-bold text-orange-600">{Number(totalOwed).toFixed(2)}</span></div>

      {showForm && <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div><Label>اسم المورد</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>الرصيد الافتتاحي المستحق له</Label><Input type="number" min="0" step="0.01" value={form.previousBalance} onChange={(e) => setForm({ ...form, previousBalance: e.target.value })} /></div>
        {form.id && <p className="sm:col-span-2 lg:col-span-3 text-xs text-gray-500">تعديل الرصيد بعد التسجيل الأول يحتاج تأكيداً وسبباً وسيظهر كسطر مستقل في كشف حساب المورد.</p>}
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'حفظ'}</Button></div>
      </form>}

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." /></form>
      <div className="bg-white rounded-lg shadow overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-gray-50"><tr><th className="text-right p-3">الاسم</th><th className="text-right p-3">الهاتف</th><th className="text-right p-3">المبلغ المستحق له</th><th className="p-3"></th></tr></thead><tbody>
        {loading && <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
        {!loading && suppliers.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا يوجد موردون بعد</td></tr>}
        {suppliers.map((s) => <tr key={s.id} className="border-t"><td className="p-3">{s.name}</td><td className="p-3 text-gray-500">{s.phone || '-'}</td><td className={`p-3 font-medium ${Number(s.balance) > 0 ? 'text-red-600' : ''}`}>{Number(s.balance).toFixed(2)}</td><td className="p-3 flex gap-1"><Button size="sm" variant="outline" onClick={() => openStatement(s)}>كشف الحساب</Button><Button size="sm" variant="outline" onClick={() => setSettleFor(s)}>سداد</Button><Button size="icon" variant="ghost" title="تعديل" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="حذف" onClick={() => removeSupplier(s)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td></tr>)}
      </tbody></table></div>

      {statementFor && statement && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStatementFor(null)}><div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">كشف حساب: {statementFor.name}</h2><Button size="icon" variant="ghost" onClick={() => setStatementFor(null)}><X className="h-4 w-4" /></Button></div><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b"><th className="text-right p-2">التاريخ</th><th className="text-right p-2">البيان</th><th className="text-right p-2">مدين</th><th className="text-right p-2">دائن</th><th className="text-right p-2">الرصيد</th></tr></thead><tbody>{statement.entries.map((entry: any, index: number) => <tr key={index} className="border-b"><td className="p-2">{new Date(entry.date).toLocaleDateString('ar')}</td><td className="p-2">{entry.description} {entry.referenceNumber}</td><td className="p-2">{entry.debit ? Number(entry.debit).toFixed(2) : '-'}</td><td className="p-2">{entry.credit ? Number(entry.credit).toFixed(2) : '-'}</td><td className="p-2 font-medium">{Number(entry.balance).toFixed(2)}</td></tr>)}</tbody></table><div className="mt-4 bg-gray-50 rounded p-3 flex justify-between"><span className="font-bold">الرصيد الحالي المستحق</span><span className="font-bold text-red-600">{Number(statement.currentBalance).toFixed(2)}</span></div></div></div>}

      {settleFor && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSettleFor(null)}><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}><h2 className="text-lg font-bold">سداد مبلغ لـ {settleFor.name}</h2><p className="text-sm text-gray-500">المستحق حاليًا: {Number(settleFor.balance).toFixed(2)}</p><div><Label>المبلغ</Label><Input type="number" min="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} /></div><div><Label>طريقة السداد</Label><select className="border rounded-md h-10 px-3 w-full" value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}><option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option><option value="card">بطاقة</option></select></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSettleFor(null)}>إلغاء</Button><Button onClick={settle} disabled={settling}>{settling ? 'جاري الحفظ...' : 'تأكيد السداد'}</Button></div></div></div>}
    </div>
  );
}
