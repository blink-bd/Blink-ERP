import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Pencil } from 'lucide-react';

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

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers', { params: { search } });
      setSuppliers(res.data.data);
      setTotalOwed(res.data.meta?.totalOwed || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(emptyForm); setShowForm(true); };
  const openEdit = (s: Supplier) => { setForm({ id: s.id, name: s.name, phone: s.phone || '', previousBalance: '' }); setShowForm(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/suppliers/${form.id}`, { name: form.name, phone: form.phone });
        toast.success('تم تحديث بيانات المورد بنجاح');
      } else {
        await api.post('/suppliers', { name: form.name, phone: form.phone, previousBalance: Number(form.previousBalance) || 0 });
        toast.success('تم إضافة المورد بنجاح');
      }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">الموردون</h1>
        <Button onClick={showForm ? () => setShowForm(false) : openCreate}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة مورد'}
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow px-5 py-3 mb-4 inline-block">
        <span className="text-sm text-gray-500 ml-2">إجمالي المستحق عليّ لكل الموردين:</span>
        <span className="text-xl font-bold text-orange-600">{totalOwed.toFixed(2)}</span>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-3 gap-4">
          <div><Label>اسم المورد</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          {!form.id && (
            <div><Label>الرصيد المستحق له (سابق)</Label><Input type="number" value={form.previousBalance} onChange={(e) => setForm({ ...form, previousBalance: e.target.value })} /></div>
          )}
          <div className="col-span-3 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</Button></div>
        </form>
      )}

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." />
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-right p-3">الاسم</th><th className="text-right p-3">الهاتف</th>
            <th className="text-right p-3">المبلغ المستحق له</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && suppliers.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا يوجد موردون بعد</td></tr>}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{s.name}</td>
                <td className="p-3 text-gray-500">{s.phone || '-'}</td>
                <td className={`p-3 font-medium ${Number(s.balance) > 0 ? 'text-red-600' : ''}`}>{Number(s.balance).toFixed(2)}</td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setSettleFor(s)}>سداد</Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {settleFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSettleFor(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">سداد مبلغ لـ {settleFor.name}</h2>
            <p className="text-sm text-gray-500">المستحق حاليًا: {Number(settleFor.balance).toFixed(2)}</p>
            <div><Label>المبلغ</Label><Input type="number" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} /></div>
            <div>
              <Label>طريقة السداد</Label>
              <select className="border rounded-md h-10 px-3 w-full" value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}>
                <option value="cash">نقدي</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="card">بطاقة</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSettleFor(null)}>إلغاء</Button>
              <Button onClick={settle} disabled={settling}>{settling ? 'جاري الحفظ...' : 'تأكيد السداد'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
