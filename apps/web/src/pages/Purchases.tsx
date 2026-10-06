import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { Plus, X, Trash2, Printer } from 'lucide-react';

interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  total: number;
  paymentStatus: string;
}

interface Line { productId: string; productName: string; quantity: string; unitCost: string }

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', productName: '', quantity: '1', unitCost: '' }]);

  const load = async () => {
    setLoading(true);
    const [p, s, w, pr] = await Promise.all([
      api.get('/purchases'),
      api.get('/suppliers'),
      api.get('/warehouses'),
      api.get('/products'),
    ]);
    setPurchases(p.data.data);
    setSuppliers(s.data.data);
    setWarehouses(w.data.data);
    setProducts(pr.data.data);
    if (w.data.data[0]) setWarehouseId((w.data.data.find((x: any) => x.isMain) || w.data.data[0]).id);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { productId: '', productName: '', quantity: '1', unitCost: '' }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const printPurchase = async (id: string) => {
    try {
      const response = await api.get(`/purchases/${id}`);
      const purchase = response.data.data;
      const supplier = suppliers.find((s) => s.id === purchase.supplierId);
      const rows = (purchase.items || []).map((item: any) => {
        const product = products.find((p) => p.id === item.productId);
        return `<tr><td>${product?.name || item.productId}</td><td>${Number(item.quantity)}</td><td>${Number(item.unitCost).toFixed(2)}</td><td>${Number(item.total).toFixed(2)}</td></tr>`;
      }).join('');
      const html = `<html dir="rtl"><head><meta charset="utf-8"><title>فاتورة شراء ${purchase.purchaseNumber}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #aaa;padding:8px;text-align:right}th{background:#eee}.totals{margin-top:16px;font-weight:bold}</style></head><body><h2>فاتورة مشتريات رقم ${purchase.purchaseNumber}</h2><p>التاريخ: ${new Date(purchase.purchaseDate).toLocaleString('ar')}</p><p>المورد: ${supplier?.name || '-'}</p>${purchase.supplierInvoiceNumber ? `<p>رقم فاتورة المورد: ${purchase.supplierInvoiceNumber}</p>` : ''}<table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p>المجموع الفرعي: ${Number(purchase.subtotal).toFixed(2)}</p><p>الضريبة: ${Number(purchase.taxAmount).toFixed(2)}</p><p>الإجمالي: ${Number(purchase.total).toFixed(2)}</p><p>المدفوع: ${Number(purchase.paidAmount).toFixed(2)}</p></div><script>window.print()</script></body></html>`;
      const win = window.open('', '_blank');
      if (!win) { toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة'); return; }
      win.document.write(html);
      win.document.close();
    } catch {
      toast.error('تعذر تحميل فاتورة المشتريات للطباعة');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !warehouseId) { toast.error('اختر المورد والمخزن'); return; }
    const items = lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({
      productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) || 0,
    }));
    if (items.length === 0) { toast.error('أضف صنف واحد على الأقل'); return; }

    setSaving(true);
    try {
      await api.post('/purchases', { supplierId, warehouseId, items, paidAmount: Number(paidAmount) || 0 });
      toast.success('تم إنشاء أمر الشراء وتحديث المخزون بنجاح');
      setShowForm(false);
      setLines([{ productId: '', productName: '', quantity: '1', unitCost: '' }]);
      setPaidAmount('');
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">المشتريات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
          {showForm ? 'إلغاء' : 'أمر شراء جديد'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white p-5 rounded-lg shadow mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>المورد</Label>
              <select className="border rounded-md h-10 px-3 w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">اختر مورد</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>المخزن</Label>
              <select className="border rounded-md h-10 px-3 w-full" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label>الأصناف</Label>
            <div className="space-y-2 mt-2">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="border rounded-md h-10 px-3 flex-1"
                    value={line.productId}
                    onChange={(e) => updateLine(i, { productId: e.target.value })}
                  >
                    <option value="">اختر منتج</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input type="number" className="w-24" placeholder="الكمية" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  <Input type="number" className="w-28" placeholder="سعر التكلفة" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeLine(i)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLine}>+ إضافة صنف</Button>
          </div>

          <div className="grid grid-cols-2 gap-4 items-end border-t pt-4">
            <div>
              <Label>المبلغ المدفوع الآن (اختياري)</Label>
              <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0 = آجل بالكامل" />
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-500">الإجمالي</p>
              <p className="text-2xl font-bold">{total.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ أمر الشراء'}</Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">رقم أمر الشراء</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الإجمالي</th>
              <th className="text-right p-3">حالة الدفع</th>
              <th className="text-right p-3">طباعة</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>}
            {!loading && purchases.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا توجد أوامر شراء بعد</td></tr>}
            {purchases.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.purchaseNumber}</td>
                <td className="p-3 text-gray-500">{new Date(p.purchaseDate).toLocaleDateString('ar')}</td>
                <td className="p-3 font-medium">{Number(p.total).toFixed(2)}</td>
                <td className="p-3">{p.paymentStatus}</td>
                <td className="p-3"><Button type="button" size="sm" variant="outline" onClick={() => printPurchase(p.id)}><Printer className="h-4 w-4 ml-1" />طباعة</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
