import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { Trash2, Plus, Minus } from 'lucide-react';

interface CartLine {
  productId: string; name: string; sku?: string;
  retailPrice: number; wholesalePrice: number | null;
  quantity: number; taxRate: number;
}
interface PaymentMethod { id: string; name: string; nameAr: string; code: string }
interface CustomerLite { id: string; name: string; phone?: string }

export function POSPage() {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priceTier, setPriceTier] = useState<'retail' | 'wholesale'>('retail');
  const [discount, setDiscount] = useState('0');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // بيانات العميل
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(null);

  // تأكيد التحويل (بطاقة / تحويل بنكي)
  const [confirmMethod, setConfirmMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    api.get('/sales/payment-methods').then((r) => setPaymentMethods(r.data.data)).catch(() => {});
    api.get('/warehouses').then((r) => {
      const main = r.data.data.find((w: any) => w.isMain) || r.data.data[0];
      if (main) setWarehouseId(main.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (customerQuery.length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      api.get('/customers/search', { params: { q: customerQuery } }).then((r) => setCustomerResults(r.data.data));
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  const priceFor = (line: CartLine) =>
    priceTier === 'wholesale' && line.wholesalePrice ? line.wholesalePrice : line.retailPrice;

  const subtotal = cart.reduce((sum, l) => sum + priceFor(l) * l.quantity, 0);
  const taxTotal = cart.reduce((sum, l) => sum + (priceFor(l) * l.quantity * l.taxRate) / 100, 0);
  const discountNum = Number(discount) || 0;
  const total = Math.max(0, subtotal + taxTotal - discountNum);

  const addProductToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        productId: product.id, name: product.name, sku: product.sku,
        retailPrice: Number(product.sellingPrice), wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
        quantity: 1, taxRate: 0,
      }];
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await api.get(`/products/search/${encodeURIComponent(query.trim())}`);
      if (res.data.success) { addProductToCart(res.data.data); setQuery(''); }
      else toast.error('المنتج غير موجود');
    } catch { toast.error('المنتج غير موجود'); }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)).filter((l) => l.quantity > 0));
  };
  const removeLine = (productId: string) => setCart((prev) => prev.filter((l) => l.productId !== productId));

  const printReceipt = (sale: any) => {
    const rows = sale.items.map((it: any) => `
      <tr><td>${it.productName}</td><td>${it.productSku || it.productBarcode || '-'}</td><td>${it.quantity}</td><td>${Number(it.total).toFixed(2)}</td></tr>
    `).join('');
    const html = `
      <html dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${sale.saleNumber}</title>
      <style>
        @page { size: A5; margin: 10mm; }
        body{font-family:Arial,sans-serif;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #999;padding:6px;text-align:right}
        th{background:#eee}
        h2{margin-bottom:4px} .totals{margin-top:12px;font-size:14px}
        .totals div{display:flex;justify-content:space-between;padding:2px 0}
        .grand{font-weight:bold;font-size:16px;border-top:2px solid #333;margin-top:6px;padding-top:6px}
      </style></head>
      <body>
        <h2>فاتورة مبيعات رقم ${sale.saleNumber}</h2>
        <p>التاريخ: ${new Date(sale.saleDate).toLocaleString('ar')}</p>
        ${selectedCustomer ? `<p>العميل: ${selectedCustomer.name} ${selectedCustomer.phone ? '- ' + selectedCustomer.phone : ''}</p>` : ''}
        <table><thead><tr><th>المنتج</th><th>الرمز</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div class="totals">
          <div><span>المجموع الفرعي</span><span>${Number(sale.subtotal).toFixed(2)}</span></div>
          <div><span>الضريبة</span><span>${Number(sale.taxAmount).toFixed(2)}</span></div>
          <div><span>الخصم</span><span>-${Number(sale.discountAmount).toFixed(2)}</span></div>
          <div class="grand"><span>الإجمالي</span><span>${Number(sale.total).toFixed(2)}</span></div>
        </div>
        <script>window.print()</script>
      </body></html>`;
    const w = window.open('', '_blank', 'width=400,height=600');
    w?.document.write(html);
    w?.document.close();
  };

  const finalizeSale = async (methodId: string | null) => {
    if (cart.length === 0) { toast.error('الرجاء إضافة أصناف أولاً'); return; }
    if (!warehouseId) { toast.error('لا يوجد مخزن افتراضي'); return; }
    if (!methodId && !selectedCustomer) { toast.error('اختر العميل للدفع الآجل'); return; }

    setLoading(true);
    try {
      const res = await api.post('/sales', {
        customerId: selectedCustomer?.id,
        warehouseId,
        discountAmount: discountNum,
        items: cart.map((l) => ({
          productId: l.productId, quantity: l.quantity, unitPrice: priceFor(l), taxRate: l.taxRate, priceTier,
        })),
        payments: methodId ? [{ methodId, amount: total }] : [],
      });
      toast.success(methodId ? 'تمت عملية البيع بنجاح' : 'تم تسجيل الفاتورة آجلة على العميل بنجاح');
      printReceipt(res.data.data);
      setCart([]); setDiscount('0'); setSelectedCustomer(null); setCustomerQuery('');
    } finally {
      setLoading(false);
      setConfirmMethod(null);
    }
  };

  const handlePaymentClick = (method: PaymentMethod) => {
    if (method.code === 'credit') {
      if (!selectedCustomer) { toast.error('اختر العميل أولاً من خانة بيانات العميل'); return; }
      finalizeSale(null);
    } else if (method.code === 'cash') {
      finalizeSale(method.id);
    } else {
      setConfirmMethod(method); // بطاقة / تحويل بنكي: نافذة تأكيد أولاً
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      <div className="col-span-2 flex flex-col">
        <div className="flex gap-3 mb-4">
          <form onSubmit={handleSearch} className="flex-1">
            <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="امسح الباركود أو ابحث برمز المنتج..." className="text-lg h-14" autoFocus />
          </form>
          <div className="flex rounded-lg overflow-hidden border h-14">
            <button onClick={() => setPriceTier('retail')} className={`px-4 font-medium ${priceTier === 'retail' ? 'bg-primary text-white' : 'bg-white'}`}>قطاعي</button>
            <button onClick={() => setPriceTier('wholesale')} className={`px-4 font-medium ${priceTier === 'wholesale' ? 'bg-primary text-white' : 'bg-white'}`}>جملة</button>
          </div>
        </div>

        <div className="relative mb-4">
          <Input
            value={selectedCustomer ? `${selectedCustomer.name} ${selectedCustomer.phone ? '- ' + selectedCustomer.phone : ''}` : customerQuery}
            onChange={(e) => { setSelectedCustomer(null); setCustomerQuery(e.target.value); }}
            placeholder="بيانات العميل (اسم أو هاتف) — اختياري لغير الآجل"
          />
          {customerResults.length > 0 && !selectedCustomer && (
            <div className="absolute z-10 bg-white border rounded-md shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
              {customerResults.map((c) => (
                <button key={c.id} className="block w-full text-right px-3 py-2 hover:bg-gray-100 text-sm"
                  onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }}>
                  {c.name} {c.phone && <span className="text-gray-400">— {c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr><th className="text-right p-3">المنتج</th><th className="text-right p-3">الرمز</th><th className="text-center p-3">الكمية</th><th className="text-right p-3">السعر</th><th className="text-right p-3">الإجمالي</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {cart.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-12">السلة فارغة — ابدأ بمسح أو البحث عن منتج</td></tr>}
              {cart.map((line) => (
                <tr key={line.productId} className="border-t">
                  <td className="p-3">{line.name}</td>
                  <td className="p-3 text-gray-500">{line.sku || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, -1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-8 text-center">{line.quantity}</span>
                      <Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </td>
                  <td className="p-3">{priceFor(line).toFixed(2)}</td>
                  <td className="p-3 font-medium">{(priceFor(line) * line.quantity).toFixed(2)}</td>
                  <td className="p-3"><Button size="icon" variant="ghost" onClick={() => removeLine(line.productId)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5 flex flex-col">
        <h2 className="text-lg font-bold mb-4">ملخص الفاتورة</h2>
        <div className="space-y-2 text-sm flex-1">
          <div className="flex justify-between"><span>المجموع الفرعي</span><span>{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>الضريبة</span><span>{taxTotal.toFixed(2)}</span></div>
          <div className="flex justify-between items-center">
            <span>الخصم</span>
            <Input type="number" className="w-24 h-8 text-left" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex justify-between text-xl font-bold pt-3 border-t mt-3"><span>الإجمالي</span><span className="text-primary">{total.toFixed(2)}</span></div>
        </div>

        <div className="space-y-2 mt-6">
          {paymentMethods.map((method) => (
            <Button key={method.id} className="w-full" variant={method.code === 'cash' ? 'default' : 'outline'}
              disabled={loading || cart.length === 0} onClick={() => handlePaymentClick(method)}>
              {method.code === 'credit' ? 'آجل على العميل' : `الدفع ${method.nameAr}`}
            </Button>
          ))}
        </div>
      </div>

      {confirmMethod && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmMethod(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">تأكيد {confirmMethod.nameAr}</h2>
            <p className="text-gray-600">تأكد من استلام المبلغ <strong>{total.toFixed(2)}</strong> عبر {confirmMethod.nameAr} قبل تأكيد الفاتورة.</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setConfirmMethod(null)}>إلغاء</Button>
              <Button onClick={() => finalizeSale(confirmMethod.id)} disabled={loading}>{loading ? 'جاري التأكيد...' : 'تم التحويل، تأكيد وطباعة'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
