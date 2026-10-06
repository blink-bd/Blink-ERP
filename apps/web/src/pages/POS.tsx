import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { Trash2, Plus, Minus, FilePlus2, FolderOpen, X } from 'lucide-react';

interface CartLine {
  productId: string;
  name: string;
  sku?: string;
  barcode?: string;
  retailPrice: number;
  wholesalePrice: number | null;
  quantity: number;
  taxRate: number;
}
interface PaymentMethod { id: string; name: string; nameAr: string; code: string }
interface CustomerLite { id: string; name: string; phone?: string }
interface PosDraft {
  id: string;
  createdAt: string;
  cart: CartLine[];
  priceTier: 'retail' | 'wholesale';
  discount: string;
  selectedCustomer: CustomerLite | null;
  customerName: string;
  customerPhone: string;
}
interface StoredPosState {
  cart: CartLine[];
  priceTier: 'retail' | 'wholesale';
  discount: string;
  selectedCustomer: CustomerLite | null;
  customerName: string;
  customerPhone: string;
  warehouseId: string;
  drafts: PosDraft[];
}

const POS_STORAGE_KEY = 'blink-pos-state';
const readStoredState = (): Partial<StoredPosState> => {
  try { return JSON.parse(localStorage.getItem(POS_STORAGE_KEY) || '{}'); } catch { return {}; }
};

export function POSPage() {
  const stored = readStoredState();
  const [query, setQuery] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>(stored.cart || []);
  const [priceTier, setPriceTier] = useState<'retail' | 'wholesale'>(stored.priceTier || 'retail');
  const [discount, setDiscount] = useState(stored.discount || '0');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [warehouseId, setWarehouseId] = useState(stored.warehouseId || '');
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<PosDraft[]>(stored.drafts || []);
  const [showDrafts, setShowDrafts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [customerName, setCustomerName] = useState(stored.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(stored.customerPhone || '');
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([]);
  const [customerFocused, setCustomerFocused] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(stored.selectedCustomer || null);
  const [confirmMethod, setConfirmMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    api.get('/sales/payment-methods').then((r) => setPaymentMethods(r.data.data)).catch(() => {});
    api.get('/warehouses').then((r) => {
      const main = r.data.data.find((w: any) => w.isMain) || r.data.data[0];
      if (main) setWarehouseId((previous) => previous || main.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const state: StoredPosState = { cart, priceTier, discount, selectedCustomer, customerName, customerPhone, warehouseId, drafts };
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(state));
  }, [cart, priceTier, discount, selectedCustomer, customerName, customerPhone, warehouseId, drafts]);

  useEffect(() => {
    if (!query.trim()) { setProductResults([]); return; }
    const timer = window.setTimeout(() => {
      api.get('/products', { params: { search: query.trim(), limit: 10 } })
        .then((r) => setProductResults(r.data.data || []))
        .catch(() => setProductResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadCustomers = (value: string) => {
    api.get('/customers/search', { params: value.trim() ? { q: value.trim() } : {} })
      .then((r) => setCustomerResults(r.data.data || []))
      .catch(() => setCustomerResults([]));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => loadCustomers(customerName), 220);
    return () => window.clearTimeout(timer);
  }, [customerName]);

  const priceFor = (line: CartLine) => priceTier === 'wholesale' && line.wholesalePrice ? line.wholesalePrice : line.retailPrice;
  const subtotal = cart.reduce((sum, line) => sum + priceFor(line) * line.quantity, 0);
  const taxTotal = cart.reduce((sum, line) => sum + (priceFor(line) * line.quantity * line.taxRate) / 100, 0);
  const discountNum = Number(discount) || 0;
  const total = Math.max(0, subtotal + taxTotal - discountNum);

  const addProductToCart = (product: any) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.productId === product.id);
      if (existing) return previous.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...previous, {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        retailPrice: Number(product.sellingPrice),
        wholesalePrice: product.wholesalePrice !== null && product.wholesalePrice !== undefined ? Number(product.wholesalePrice) : null,
        quantity: 1,
        taxRate: Number(product.taxRate) || 0,
      }];
    });
    setQuery('');
    setProductResults([]);
    inputRef.current?.focus();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const response = await api.get(`/products/search/${encodeURIComponent(query.trim())}`);
      if (response.data.success) addProductToCart(response.data.data);
      else if (productResults[0]) addProductToCart(productResults[0]);
      else toast.error('المنتج غير موجود');
    } catch {
      if (productResults[0]) addProductToCart(productResults[0]);
      else toast.error('المنتج غير موجود');
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((previous) => previous.map((line) => line.productId === productId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line).filter((line) => line.quantity > 0));
  };
  const removeLine = (productId: string) => setCart((previous) => previous.filter((line) => line.productId !== productId));

  const currentDraft = (): Omit<PosDraft, 'id' | 'createdAt'> => ({ cart, priceTier, discount, selectedCustomer, customerName, customerPhone });
  const clearCurrent = () => {
    setCart([]); setDiscount('0'); setSelectedCustomer(null); setCustomerName(''); setCustomerPhone(''); setQuery(''); setProductResults([]);
  };
  const createNewInvoice = () => {
    if (cart.length === 0 && !customerName.trim()) { toast('الفاتورة الحالية فارغة'); return; }
    setDrafts((previous) => [...previous, { ...currentDraft(), id: `draft-${Date.now()}`, createdAt: new Date().toISOString() }]);
    clearCurrent();
    toast.success('تم حفظ الفاتورة الحالية. يمكنك استكمالها من الفواتير المحفوظة.');
  };
  const openDraft = (draft: PosDraft) => {
    if (cart.length > 0) {
      setDrafts((previous) => [...previous, { ...currentDraft(), id: `draft-${Date.now()}`, createdAt: new Date().toISOString() }]);
    }
    setCart(draft.cart); setPriceTier(draft.priceTier); setDiscount(draft.discount); setSelectedCustomer(draft.selectedCustomer); setCustomerName(draft.customerName); setCustomerPhone(draft.customerPhone);
    setDrafts((previous) => previous.filter((item) => item.id !== draft.id));
    setShowDrafts(false);
  };
  const deleteDraft = (id: string) => setDrafts((previous) => previous.filter((draft) => draft.id !== id));

  const printReceipt = (sale: any) => {
    const rows = sale.items.map((item: any) => `<tr><td>${item.productName}</td><td>${item.productSku || item.productBarcode || '-'}</td><td>${item.quantity}</td><td>${Number(item.total).toFixed(2)}</td></tr>`).join('');
    const html = `<html dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${sale.saleNumber}</title><style>@page{size:A5;margin:10mm}body{font-family:Arial,sans-serif;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:6px;text-align:right}th{background:#eee}.totals{margin-top:12px;font-size:14px}.totals div{display:flex;justify-content:space-between;padding:2px 0}.grand{font-weight:bold;font-size:16px;border-top:2px solid #333;margin-top:6px;padding-top:6px}</style></head><body><h2>فاتورة مبيعات رقم ${sale.saleNumber}</h2><p>التاريخ: ${new Date(sale.saleDate).toLocaleString('ar')}</p>${selectedCustomer ? `<p>العميل: ${selectedCustomer.name} ${selectedCustomer.phone ? `- ${selectedCustomer.phone}` : ''}</p>` : ''}<table><thead><tr><th>المنتج</th><th>الرمز</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>المجموع الفرعي</span><span>${Number(sale.subtotal).toFixed(2)}</span></div><div><span>الضريبة</span><span>${Number(sale.taxAmount).toFixed(2)}</span></div><div><span>الخصم</span><span>-${Number(sale.discountAmount).toFixed(2)}</span></div><div class="grand"><span>الإجمالي</span><span>${Number(sale.total).toFixed(2)}</span></div></div><script>window.print()</script></body></html>`;
    const windowRef = window.open('', '_blank', 'width=400,height=600');
    windowRef?.document.write(html); windowRef?.document.close();
  };

  const ensureCustomer = async (): Promise<string | undefined> => {
    if (selectedCustomer) return selectedCustomer.id;
    if (!customerName.trim()) return undefined;
    const response = await api.post('/customers', { name: customerName.trim(), phone: customerPhone.trim() || undefined, previousBalance: 0 });
    const customer = response.data.data as CustomerLite;
    setSelectedCustomer(customer);
    return customer.id;
  };

  const finalizeSale = async (methodId: string | null) => {
    if (cart.length === 0) { toast.error('الرجاء إضافة أصناف أولاً'); return; }
    if (!warehouseId) { toast.error('لا يوجد مخزن افتراضي'); return; }
    setLoading(true);
    try {
      const customerId = await ensureCustomer();
      const response = await api.post('/sales', {
        customerId,
        warehouseId,
        discountAmount: discountNum,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: priceFor(line), taxRate: line.taxRate, priceTier })),
        payments: methodId ? [{ methodId, amount: total }] : [],
      });
      toast.success(methodId ? 'تمت عملية البيع بنجاح' : 'تم تسجيل الفاتورة آجلة على العميل بنجاح');
      printReceipt(response.data.data);
      clearCurrent();
    } finally {
      setLoading(false);
      setConfirmMethod(null);
    }
  };

  const handlePaymentClick = (method: PaymentMethod) => {
    if (method.code === 'credit') {
      if (!customerName.trim() && !selectedCustomer) { toast.error('اكتب اسم العميل للدفع الآجل'); return; }
      finalizeSale(null);
    } else if (method.code === 'cash') {
      finalizeSale(method.id);
    } else {
      setConfirmMethod(method);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="flex flex-col lg:col-span-2">
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز أو الباركود..." className="text-lg h-14" autoFocus />
            {productResults.length > 0 && <div className="absolute z-20 bg-white border rounded-md shadow-lg w-full mt-1 max-h-64 overflow-y-auto">{productResults.map((product) => <button type="button" key={product.id} className="block w-full text-right px-4 py-3 hover:bg-gray-100 border-b last:border-0" onClick={() => addProductToCart(product)}><span className="font-medium">{product.name}</span><span className="text-xs text-gray-500 mr-3">{product.sku || product.barcode || ''}</span><span className="text-xs text-primary mr-3">{Number(product.sellingPrice).toFixed(2)}</span></button>)}</div>}
          </form>
          <div className="flex rounded-lg overflow-hidden border h-14"><button type="button" onClick={() => setPriceTier('retail')} className={`px-4 font-medium ${priceTier === 'retail' ? 'bg-primary text-white' : 'bg-white'}`}>قطاعي</button><button type="button" onClick={() => setPriceTier('wholesale')} className={`px-4 font-medium ${priceTier === 'wholesale' ? 'bg-primary text-white' : 'bg-white'}`}>جملة</button></div>
          <Button variant="outline" onClick={createNewInvoice} title="حفظ الحالية وفتح فاتورة جديدة"><FilePlus2 className="h-4 w-4 ml-2" />فاتورة جديدة</Button>
          <div className="relative"><Button variant="outline" onClick={() => setShowDrafts((value) => !value)}><FolderOpen className="h-4 w-4 ml-2" />المحفوظة ({drafts.length})</Button>{showDrafts && <div className="absolute z-30 left-0 top-11 bg-white border rounded-md shadow-lg w-72 p-2">{drafts.length === 0 ? <p className="text-sm text-gray-400 p-3">لا توجد فواتير محفوظة</p> : drafts.map((draft) => <div key={draft.id} className="flex items-center gap-1 border-b last:border-0"><button className="flex-1 text-right text-sm p-2 hover:bg-gray-100" onClick={() => openDraft(draft)}>فاتورة مؤجلة — {draft.cart.length} أصناف</button><button className="p-2 text-red-500" onClick={() => deleteDraft(draft.id)}><X className="h-4 w-4" /></button></div>)}</div>}</div>
        </div>

        <div className="relative mb-4 grid grid-cols-2 gap-2">
          <div className="relative"><Input value={customerName} onFocus={() => { setCustomerFocused(true); loadCustomers(customerName); }} onChange={(e) => { setSelectedCustomer(null); setCustomerName(e.target.value); }} placeholder="اسم العميل — اكتب أول حرف للبحث" />{customerFocused && customerResults.length > 0 && !selectedCustomer && <div className="absolute z-10 bg-white border rounded-md shadow-lg w-full mt-1 max-h-48 overflow-y-auto">{customerResults.map((customer) => <button type="button" key={customer.id} className="block w-full text-right px-3 py-2 hover:bg-gray-100 text-sm" onClick={() => { setSelectedCustomer(customer); setCustomerName(customer.name); setCustomerPhone(customer.phone || ''); setCustomerResults([]); setCustomerFocused(false); }}>{customer.name} {customer.phone && <span className="text-gray-400">— {customer.phone}</span>}</button>)}<button type="button" className="block w-full text-right px-3 py-2 text-primary border-t" onClick={() => { setCustomerResults([]); setCustomerFocused(false); }}>إضافة كعميل جديد</button></div>}</div>
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="هاتف العميل" />
        </div>

        <div className="bg-white rounded-lg shadow flex-1 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-gray-50 sticky top-0"><tr><th className="text-right p-3">المنتج</th><th className="text-right p-3">الرمز</th><th className="text-center p-3">الكمية</th><th className="text-right p-3">السعر</th><th className="text-right p-3">الإجمالي</th><th className="p-3"></th></tr></thead><tbody>
          {cart.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-12">السلة فارغة — ابدأ بالبحث عن منتج</td></tr>}
          {cart.map((line) => <tr key={line.productId} className="border-t"><td className="p-3">{line.name}</td><td className="p-3 text-gray-500">{line.sku || line.barcode || '-'}</td><td className="p-3"><div className="flex items-center justify-center gap-2"><Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, -1)}><Minus className="h-3 w-3" /></Button><span className="w-8 text-center">{line.quantity}</span><Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, 1)}><Plus className="h-3 w-3" /></Button></div></td><td className="p-3">{priceFor(line).toFixed(2)}</td><td className="p-3 font-medium">{(priceFor(line) * line.quantity).toFixed(2)}</td><td className="p-3"><Button size="icon" variant="ghost" onClick={() => removeLine(line.productId)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td></tr>)}
        </tbody></table></div>
      </div>

      <div className="bg-white rounded-lg shadow p-5 flex flex-col"><h2 className="text-lg font-bold mb-4">ملخص الفاتورة</h2><div className="space-y-2 text-sm flex-1"><div className="flex justify-between"><span>المجموع الفرعي</span><span>{subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>الضريبة</span><span>{taxTotal.toFixed(2)}</span></div><div className="flex justify-between items-center"><span>الخصم</span><Input type="number" className="w-24 h-8 text-left" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div><div className="flex justify-between text-xl font-bold pt-3 border-t mt-3"><span>الإجمالي</span><span className="text-primary">{total.toFixed(2)}</span></div></div><div className="space-y-2 mt-6">{paymentMethods.map((method) => <Button key={method.id} className="w-full" variant={method.code === 'cash' ? 'default' : 'outline'} disabled={loading || cart.length === 0} onClick={() => handlePaymentClick(method)}>{method.code === 'credit' ? 'آجل على العميل' : `الدفع ${method.nameAr}`}</Button>)}</div></div>

      {confirmMethod && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmMethod(null)}><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}><h2 className="text-lg font-bold">تأكيد {confirmMethod.nameAr}</h2><p className="text-gray-600">تأكد من استلام المبلغ <strong>{total.toFixed(2)}</strong> عبر {confirmMethod.nameAr} قبل تأكيد الفاتورة.</p><div className="flex justify-center gap-2"><Button variant="outline" onClick={() => setConfirmMethod(null)}>إلغاء</Button><Button onClick={() => finalizeSale(confirmMethod.id)} disabled={loading}>{loading ? 'جاري التأكيد...' : 'تأكيد وطباعة'}</Button></div></div></div>}
    </div>
  );
}
