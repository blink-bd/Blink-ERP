import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

interface Expense { id: string; expenseNumber: string; amount: number; description: string; expenseDate: string }

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ day: null, month: null, year: null });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ categoryId: '', description: '', amount: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [e, c, d, m, y] = await Promise.all([
        api.get('/expenses'),
        api.get('/expenses/categories'),
        api.get('/expenses/summary', { params: { period: 'day' } }),
        api.get('/expenses/summary', { params: { period: 'month' } }),
        api.get('/expenses/summary', { params: { period: 'year' } }),
      ]);
      setExpenses(e.data.data);
      setCategories(c.data.data);
      setSummary({ day: d.data.data, month: m.data.data, year: y.data.data });
      if (c.data.data[0] && !form.categoryId) setForm((f) => ({ ...f, categoryId: c.data.data[0].id }));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) { toast.error('أضف فئة مصروفات أولاً'); return; }
    setSaving(true);
    try {
      await api.post('/expenses', { categoryId: form.categoryId, description: form.description, amount: Number(form.amount) });
      toast.success('تم تسجيل المصروف بنجاح');
      setShowForm(false);
      setForm({ ...form, description: '', amount: '' });
      load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">المصروفات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'إضافة مصروف'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مصروفات اليوم</p><p className="text-2xl font-bold text-red-600">{summary.day ? Number(summary.day.total).toFixed(2) : '-'}</p></div>
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مصروفات الشهر</p><p className="text-2xl font-bold text-red-600">{summary.month ? Number(summary.month.total).toFixed(2) : '-'}</p></div>
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مصروفات السنة</p><p className="text-2xl font-bold text-red-600">{summary.year ? Number(summary.year.total).toFixed(2) : '-'}</p></div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 grid grid-cols-3 gap-4">
          <div>
            <Label>الفئة</Label>
            <select className="border rounded-md h-10 px-3 w-full" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.length === 0 && <option value="">لا توجد فئات — أضف فئة أولاً</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
            </select>
          </div>
          <div><Label>الوصف</Label><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>المبلغ</Label><Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="col-span-3 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ المصروف'}</Button></div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="text-right p-3">الرقم</th><th className="text-right p-3">الوصف</th><th className="text-right p-3">التاريخ</th><th className="text-right p-3">المبلغ</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && expenses.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد مصروفات مسجلة بعد</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.expenseNumber}</td>
                <td className="p-3">{e.description}</td>
                <td className="p-3 text-gray-500">{new Date(e.expenseDate).toLocaleString('ar')}</td>
                <td className="p-3 font-medium">{Number(e.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
