import { useState, useEffect, useRef } from 'react';
import { Signed } from '@/lib/signed';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { Trash2, Plus, Minus, FilePlus2, FolderOpen, X, MessageCircle } from 'lucide-react';
import { useFeature } from '@/contexts/FeaturesContext';
import { escapeHtml } from '@/lib/escape';
import { useAuth } from '@/contexts/AuthContext';
import { keepIfValid, useWorkingWarehouses, useWorkspace } from '@/contexts/WorkspaceContext';
import { formatDateTime } from '@/lib/datetime';
import { ShareInvoiceDialog, type ShareSource } from '@/components/ShareInvoiceDialog';

type PriceTier = 'retail' | 'half_wholesale' | 'wholesale';

interface CartLine {
  productId: string;
  name: string;
  sku?: string;
  barcode?: string;
  retailPrice: number;
  wholesalePrice: number | null;
  halfWholesalePrice?: number | null;
  quantity: number;
  taxRate: number;
}
interface PaymentMethod {
  id: string;
  name: string;
  nameAr: string;
  code: string;
}
interface CustomerLite {
  id: string;
  name: string;
  phone?: string;
  priceTier?: string;
}
interface PosDraft {
  id: string;
  createdAt: string;
  cart: CartLine[];
  priceTier: PriceTier;
  discount: string;
  selectedCustomer: CustomerLite | null;
  customerName: string;
  customerPhone: string;
}
interface StoredPosState {
  cart: CartLine[];
  priceTier: PriceTier;
  discount: string;
  selectedCustomer: CustomerLite | null;
  customerName: string;
  customerPhone: string;
  warehouseId: string;
  drafts: PosDraft[];
}

// المفتاح القديم كان مشترك بين كل المستخدمين على نفس الجهاز، وكان بيحتفظ بمخزن ممكن
// مايبقاش ضمن فرع العمل. دلوقتي الحالة محفوظة لكل مستخدم لوحده.
const LEGACY_POS_STORAGE_KEY = 'blink-pos-state';
const posStorageKey = (tenantId?: string, userId?: string) =>
  userId ? `${LEGACY_POS_STORAGE_KEY}:${tenantId || '-'}:${userId}` : LEGACY_POS_STORAGE_KEY;

const readStoredState = (key: string): Partial<StoredPosState> => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    if (key !== LEGACY_POS_STORAGE_KEY) {
      const legacy = localStorage.getItem(LEGACY_POS_STORAGE_KEY);
      if (legacy) {
        // نقل الفاتورة المفتوحة من المفتاح القديم، من غير المخزن القديم
        // (المفتاح القديم بيتمسح بعد أول حفظ بالمفتاح الجديد).
        const parsed = JSON.parse(legacy) as Partial<StoredPosState>;
        delete parsed.warehouseId;
        return parsed;
      }
    }
    return {};
  } catch {
    return {};
  }
};

export function POSPage() {
  const { user } = useAuth();
  const { workspace, reload: reloadWorkspace } = useWorkspace();
  const storageKey = posStorageKey(user?.tenantId, user?.id);
  const [stored] = useState(() => readStoredState(storageKey));
  const {
    ready: warehousesReady,
    warehouses: saleWarehouses,
    defaultWarehouseId,
  } = useWorkingWarehouses();
  const [query, setQuery] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>(stored.cart || []);
  const [priceTier, setPriceTier] = useState<PriceTier>(stored.priceTier || 'retail');
  const halfWholesaleEnabled = useFeature('half_wholesale_pricing');
  // زراير نقطة البيع اللي المدير العام بيتحكم فيها لكل تاجر.
  const wholesaleEnabled = useFeature('pos.wholesale_price');
  const discountEnabled = useFeature('pos.discount');
  const creditEnabled = useFeature('pos.credit_sale');
  const multiInvoicesEnabled = useFeature('pos.multi_invoices');
  const printEnabled = useFeature('pos.print_receipt');
  const shareEnabled = useFeature('pos.share_after_sale');
  const effectiveTier: PriceTier =
    (priceTier === 'half_wholesale' && !halfWholesaleEnabled) ||
    (priceTier === 'wholesale' && !wholesaleEnabled)
      ? 'retail'
      : priceTier;
  const [discount, setDiscount] = useState(stored.discount || '0');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [warehouseId, setWarehouseId] = useState(stored.warehouseId || '');
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState<{ id: string; number: string } | null>(null);
  const [shareSource, setShareSource] = useState<ShareSource | null>(null);
  const [drafts, setDrafts] = useState<PosDraft[]>(stored.drafts || []);
  const [showDrafts, setShowDrafts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [customerName, setCustomerName] = useState(stored.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(stored.customerPhone || '');
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([]);
  const [customerFocused, setCustomerFocused] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(
    stored.selectedCustomer || null
  );
  const [confirmMethod, setConfirmMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    api
      .get('/sales/payment-methods')
      .then((r) => setPaymentMethods(r.data.data))
      .catch(() => {});
  }, []);

  // مخزن البيع لازم يكون دايماً من مخازن فرع العمل الحالي: لو المحفوظ لسه صالح بنسيبه،
  // غير كده بناخد مخزن العمل/الافتراضي. الفاتورة المفتوحة نفسها مابتتمسحش.
  useEffect(() => {
    if (!warehousesReady) return;
    setWarehouseId((previous) => keepIfValid(saleWarehouses, previous, defaultWarehouseId));
  }, [warehousesReady, saleWarehouses, defaultWarehouseId]);

  useEffect(() => {
    const state: StoredPosState = {
      cart,
      priceTier,
      discount,
      selectedCustomer,
      customerName,
      customerPhone,
      warehouseId,
      drafts,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      if (storageKey !== LEGACY_POS_STORAGE_KEY) localStorage.removeItem(LEGACY_POS_STORAGE_KEY);
    } catch {
      // التخزين المحلي ممكن يكون ممتلي أو مقفول؛ البيع نفسه مايتأثرش.
    }
  }, [
    storageKey,
    cart,
    priceTier,
    discount,
    selectedCustomer,
    customerName,
    customerPhone,
    warehouseId,
    drafts,
  ]);

  useEffect(() => {
    if (!query.trim()) {
      setProductResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .get('/products', { params: { search: query.trim(), limit: 10 } })
        .then((r) => setProductResults(r.data.data || []))
        .catch(() => setProductResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadCustomers = (value: string) => {
    api
      .get('/customers/search', { params: value.trim() ? { q: value.trim() } : {} })
      .then((r) => setCustomerResults(r.data.data || []))
      .catch(() => setCustomerResults([]));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => loadCustomers(customerName), 220);
    return () => window.clearTimeout(timer);
  }, [customerName]);

  const priceFor = (line: CartLine) => {
    if (effectiveTier === 'wholesale' && line.wholesalePrice) return line.wholesalePrice;
    if (effectiveTier === 'half_wholesale' && line.halfWholesalePrice)
      return line.halfWholesalePrice;
    return line.retailPrice;
  };
  // السيرفر بيرفض نصف الجملة لمنتج ملوش سعر نصف جملة، فنبعت قطاعي للصنف ده
  const tierFor = (line: CartLine): PriceTier => {
    if (effectiveTier === 'wholesale' && line.wholesalePrice) return 'wholesale';
    if (effectiveTier === 'half_wholesale' && line.halfWholesalePrice) return 'half_wholesale';
    return 'retail';
  };
  const subtotal = cart.reduce((sum, line) => sum + priceFor(line) * line.quantity, 0);
  const taxTotal = cart.reduce(
    (sum, line) => sum + (priceFor(line) * line.quantity * line.taxRate) / 100,
    0
  );
  const discountNum = discountEnabled ? Number(discount) || 0 : 0;
  const total = Math.max(0, subtotal + taxTotal - discountNum);

  const addProductToCart = (product: any) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.productId === product.id);
      if (existing)
        return previous.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      return [
        ...previous,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          retailPrice: Number(product.sellingPrice),
          wholesalePrice:
            product.wholesalePrice !== null && product.wholesalePrice !== undefined
              ? Number(product.wholesalePrice)
              : null,
          halfWholesalePrice:
            product.halfWholesalePrice !== null && product.halfWholesalePrice !== undefined
              ? Number(product.halfWholesalePrice)
              : null,
          quantity: 1,
          taxRate: Number(product.taxRate) || 0,
        },
      ];
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
    setCart((previous) =>
      previous
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  };
  const removeLine = (productId: string) =>
    setCart((previous) => previous.filter((line) => line.productId !== productId));

  const currentDraft = (): Omit<PosDraft, 'id' | 'createdAt'> => ({
    cart,
    priceTier,
    discount,
    selectedCustomer,
    customerName,
    customerPhone,
  });
  const clearCurrent = () => {
    setCart([]);
    setDiscount('0');
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setQuery('');
    setProductResults([]);
  };
  const createNewInvoice = () => {
    if (cart.length === 0 && !customerName.trim()) {
      toast('الفاتورة الحالية فارغة');
      return;
    }
    setDrafts((previous) => [
      ...previous,
      { ...currentDraft(), id: `draft-${Date.now()}`, createdAt: new Date().toISOString() },
    ]);
    clearCurrent();
    toast.success('تم حفظ الفاتورة الحالية. يمكنك استكمالها من الفواتير المحفوظة.');
  };
  const openDraft = (draft: PosDraft) => {
    if (cart.length > 0) {
      setDrafts((previous) => [
        ...previous,
        { ...currentDraft(), id: `draft-${Date.now()}`, createdAt: new Date().toISOString() },
      ]);
    }
    setCart(draft.cart);
    setPriceTier(draft.priceTier);
    setDiscount(draft.discount);
    setSelectedCustomer(draft.selectedCustomer);
    setCustomerName(draft.customerName);
    setCustomerPhone(draft.customerPhone);
    setDrafts((previous) => previous.filter((item) => item.id !== draft.id));
    setShowDrafts(false);
  };
  const deleteDraft = (id: string) =>
    setDrafts((previous) => previous.filter((draft) => draft.id !== id));

  const printReceipt = (sale: any) => {
    if (sale.receiptToken) {
      const receiptUrl = `/receipt/${encodeURIComponent(sale.receiptToken)}?print=1`;
      const receiptWindow = window.open(receiptUrl, '_blank');
      if (!receiptWindow) {
        toast('تعذر فتح نافذة جديدة؛ سيتم عرض الإيصال في الصفحة الحالية.');
        window.location.assign(receiptUrl);
      }
      return;
    }

    // Legacy fallback for invoices created before electronic receipt links were enabled.
    const rows = sale.items
      .map(
        (item: any) =>
          `<tr><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.productSku || item.productBarcode || '-')}</td><td>${escapeHtml(item.quantity)}</td><td>${Number(item.total).toFixed(2)}</td></tr>`
      )
      .join('');
    const html = `<html dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${escapeHtml(sale.saleNumber)}</title><style>@page{size:A5;margin:10mm}body{font-family:Arial,sans-serif;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:6px;text-align:right}th{background:#eee}.totals{margin-top:12px;font-size:14px}.totals div{display:flex;justify-content:space-between;padding:2px 0}.grand{font-weight:bold;font-size:16px;border-top:2px solid #333;margin-top:6px;padding-top:6px}</style></head><body><h2>فاتورة مبيعات رقم ${escapeHtml(sale.saleNumber)}</h2><p>التاريخ: ${formatDateTime(sale.saleDate)}</p>${selectedCustomer ? `<p>العميل: ${escapeHtml(selectedCustomer.name)} ${selectedCustomer.phone ? `- ${escapeHtml(selectedCustomer.phone)}` : ''}</p>` : ''}<table><thead><tr><th>المنتج</th><th>الرمز</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>المجموع الفرعي</span><span>${Number(sale.subtotal).toFixed(2)}</span></div><div><span>الضريبة</span><span>${Number(sale.taxAmount).toFixed(2)}</span></div><div><span>الخصم</span><span>-${Number(sale.discountAmount).toFixed(2)}</span></div><div class="grand"><span>الإجمالي</span><span>${Number(sale.total).toFixed(2)}</span></div></div><script>window.print()</script></body></html>`;
    const windowRef = window.open('', '_blank', 'width=400,height=600');
    windowRef?.document.write(html);
    windowRef?.document.close();
  };

  const ensureCustomer = async (): Promise<string | undefined> => {
    if (selectedCustomer) return selectedCustomer.id;
    if (!customerName.trim()) return undefined;
    const response = await api.post('/customers', {
      name: customerName.trim(),
      phone: customerPhone.trim() || undefined,
      previousBalance: 0,
    });
    const customer = response.data.data as CustomerLite;
    setSelectedCustomer(customer);
    return customer.id;
  };

  const finalizeSale = async (methodId: string | null) => {
    if (cart.length === 0) {
      toast.error('الرجاء إضافة أصناف أولاً');
      return;
    }
    if (!warehousesReady) {
      toast('لحظة، جاري تحميل المخازن...');
      return;
    }
    if (!warehouseId || !saleWarehouses.some((w) => w.id === warehouseId)) {
      toast.error('مفيش مخزن متاح للبيع في فرع العمل الحالي. غيّر فرع العمل من صفحة «فرع العمل».');
      return;
    }
    setLoading(true);
    try {
      const customerId = await ensureCustomer();
      const response = await api.post('/sales', {
        customerId,
        warehouseId,
        discountAmount: discountNum,
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: priceFor(line),
          taxRate: line.taxRate,
          priceTier: tierFor(line),
        })),
        payments: methodId ? [{ methodId, amount: total }] : [],
      });
      toast.success(methodId ? 'تمت عملية البيع بنجاح' : 'تم تسجيل الفاتورة آجلة على العميل بنجاح');
      if (printEnabled) printReceipt(response.data.data);
      setLastSale({ id: response.data.data.id, number: response.data.data.saleNumber });
      clearCurrent();
    } catch (error: any) {
      // الرسالة بتظهر من api. لو الرفض بسبب الصلاحيات/المخزن بنزامن فرع العمل
      // عشان الاختيار يتصلّح تلقائياً، والفاتورة تفضل زي ما هي.
      const status = error?.response?.status;
      if (status === 403 || status === 400) reloadWorkspace();
    } finally {
      setLoading(false);
      setConfirmMethod(null);
    }
  };

  const handlePaymentClick = (method: PaymentMethod) => {
    if (method.code === 'credit') {
      if (!customerName.trim() && !selectedCustomer) {
        toast.error('اكتب اسم العميل للدفع الآجل');
        return;
      }
      finalizeSale(null);
    } else if (method.code === 'cash') {
      finalizeSale(method.id);
    } else {
      setConfirmMethod(method);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:h-full">
      <ShareInvoiceDialog source={shareSource} onClose={() => setShareSource(null)} />
      <div className="flex flex-col lg:col-span-2">
        {lastSale && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm">
            <span>
              آخر فاتورة: <strong>{lastSale.number}</strong>
            </span>
            <div className="flex gap-2">
              {shareEnabled && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[#128C7E]"
                  onClick={() => setShareSource({ kind: 'sale', id: lastSale.id })}
                >
                  <MessageCircle className="ml-1 h-4 w-4" /> إرسال للعميل واتساب
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLastSale(null)}
                aria-label="إخفاء"
              >
                ✕
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الرمز أو الباركود..."
              className="text-lg h-14"
              autoFocus
            />
            {productResults.length > 0 && (
              <div className="absolute z-20 bg-white border rounded-md shadow-lg w-full mt-1 max-h-64 overflow-y-auto">
                {productResults.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    className="block w-full text-right px-4 py-3 hover:bg-gray-100 border-b last:border-0"
                    onClick={() => addProductToCart(product)}
                  >
                    <span className="font-medium">{product.name}</span>
                    <span className="text-xs text-gray-500 mr-3">
                      {product.sku || product.barcode || ''}
                    </span>
                    <span className="text-xs text-primary mr-3">
                      <Signed value={Number(product.sellingPrice)}>{Number(product.sellingPrice).toFixed(2)}</Signed>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="flex rounded-lg overflow-hidden border h-14">
            <button
              type="button"
              onClick={() => setPriceTier('retail')}
              className={`px-4 font-medium ${effectiveTier === 'retail' ? 'bg-primary text-white' : 'bg-white'}`}
            >
              قطاعي
            </button>
            {halfWholesaleEnabled && (
              <button
                type="button"
                onClick={() => setPriceTier('half_wholesale')}
                className={`px-4 font-medium ${effectiveTier === 'half_wholesale' ? 'bg-primary text-white' : 'bg-white'}`}
              >
                نص جملة
              </button>
            )}
            {wholesaleEnabled && (
              <button
                type="button"
                onClick={() => setPriceTier('wholesale')}
                className={`px-4 font-medium ${effectiveTier === 'wholesale' ? 'bg-primary text-white' : 'bg-white'}`}
              >
                جملة
              </button>
            )}
          </div>
          {saleWarehouses.length > 1 ? (
            <label className="flex h-14 items-center gap-2 rounded-lg border bg-white px-3 text-sm">
              <span className="whitespace-nowrap text-gray-500">البيع من</span>
              <select
                className="h-10 max-w-[12rem] rounded border px-2"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                aria-label="مخزن البيع"
              >
                {saleWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            workspace?.showSelector &&
            saleWarehouses[0] && (
              <span className="flex h-14 items-center rounded-lg border bg-white px-3 text-sm text-gray-600">
                البيع من: <b className="mr-1">{saleWarehouses[0].name}</b>
              </span>
            )
          )}
          {warehousesReady && saleWarehouses.length === 0 && (
            <span className="flex h-14 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-800">
              مفيش مخزن نشط في فرع العمل الحالي
            </span>
          )}
          {multiInvoicesEnabled && (
            <>
              <Button
                variant="outline"
                onClick={createNewInvoice}
                title="حفظ الحالية وفتح فاتورة جديدة"
              >
                <FilePlus2 className="h-4 w-4 ml-2" />
                فاتورة جديدة
              </Button>
              <div className="relative">
                <Button variant="outline" onClick={() => setShowDrafts((value) => !value)}>
                  <FolderOpen className="h-4 w-4 ml-2" />
                  المحفوظة ({drafts.length})
                </Button>
                {showDrafts && (
                  <div className="absolute z-30 left-0 top-11 bg-white border rounded-md shadow-lg w-72 p-2">
                    {drafts.length === 0 ? (
                      <p className="text-sm text-gray-400 p-3">لا توجد فواتير محفوظة</p>
                    ) : (
                      drafts.map((draft) => (
                        <div
                          key={draft.id}
                          className="flex items-center gap-1 border-b last:border-0"
                        >
                          <button
                            className="flex-1 text-right text-sm p-2 hover:bg-gray-100"
                            onClick={() => openDraft(draft)}
                          >
                            فاتورة مؤجلة — {draft.cart.length} أصناف
                          </button>
                          <button
                            className="p-2 text-red-500"
                            onClick={() => deleteDraft(draft.id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="relative mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="relative">
            <Input
              value={customerName}
              onFocus={() => {
                setCustomerFocused(true);
                loadCustomers(customerName);
              }}
              onChange={(e) => {
                setSelectedCustomer(null);
                setCustomerName(e.target.value);
              }}
              placeholder="اسم العميل — اكتب أول حرف للبحث"
            />
            {customerFocused && customerResults.length > 0 && !selectedCustomer && (
              <div className="absolute z-10 bg-white border rounded-md shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
                {customerResults.map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    className="block w-full text-right px-3 py-2 hover:bg-gray-100 text-sm"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      // تسعيرة العميل المحفوظة (جملة / نص جملة) بتتطبق تلقائياً
                      if (
                        (customer.priceTier === 'wholesale' && wholesaleEnabled) ||
                        (customer.priceTier === 'half_wholesale' && halfWholesaleEnabled)
                      ) {
                        setPriceTier(customer.priceTier as PriceTier);
                        toast.success(
                          customer.priceTier === 'wholesale'
                            ? 'تم تطبيق سعر الجملة لهذا العميل'
                            : 'تم تطبيق سعر نص الجملة لهذا العميل'
                        );
                      }
                      setCustomerName(customer.name);
                      setCustomerPhone(customer.phone || '');
                      setCustomerResults([]);
                      setCustomerFocused(false);
                    }}
                  >
                    {customer.name}{' '}
                    {customer.phone && <span className="text-gray-400">— {customer.phone}</span>}
                  </button>
                ))}
                <button
                  type="button"
                  className="block w-full text-right px-3 py-2 text-primary border-t"
                  onClick={() => {
                    setCustomerResults([]);
                    setCustomerFocused(false);
                  }}
                >
                  إضافة كعميل جديد
                </button>
              </div>
            )}
          </div>
          <Input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="هاتف العميل"
          />
        </div>

        <div className="bg-white rounded-lg shadow flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-right p-3">المنتج</th>
                <th className="text-right p-3">الرمز</th>
                <th className="text-center p-3">الكمية</th>
                <th className="text-right p-3">السعر</th>
                <th className="text-right p-3">الإجمالي</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">
                    السلة فارغة — ابدأ بالبحث عن منتج
                  </td>
                </tr>
              )}
              {cart.map((line) => (
                <tr key={line.productId} className="border-t">
                  <td className="p-3">{line.name}</td>
                  <td className="p-3 text-gray-500">{line.sku || line.barcode || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateQuantity(line.productId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateQuantity(line.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-3"><Signed value={priceFor(line)}>{priceFor(line).toFixed(2)}</Signed></td>
                  <td className="p-3 font-medium"><Signed value={(priceFor(line) * line.quantity)}>{(priceFor(line) * line.quantity).toFixed(2)}</Signed></td>
                  <td className="p-3">
                    <Button size="icon" variant="ghost" onClick={() => removeLine(line.productId)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5 flex flex-col">
        <h2 className="text-lg font-bold mb-4">ملخص الفاتورة</h2>
        <div className="space-y-2 text-sm flex-1">
          <div className="flex justify-between">
            <span>المجموع الفرعي</span>
            <span><Signed value={subtotal}>{subtotal.toFixed(2)}</Signed></span>
          </div>
          <div className="flex justify-between">
            <span>الضريبة</span>
            <span><Signed value={taxTotal}>{taxTotal.toFixed(2)}</Signed></span>
          </div>
          {discountEnabled && (
            <div className="flex justify-between items-center">
              <span>الخصم</span>
              <Input
                type="number"
                className="w-24 h-8 text-left"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-between text-xl font-bold pt-3 border-t mt-3">
            <span>الإجمالي</span>
            <span ><Signed value={total}>{total.toFixed(2)}</Signed></span>
          </div>
        </div>
        <div className="space-y-2 mt-6">
          {paymentMethods
            .filter((method) => method.code !== 'credit' || creditEnabled)
            .map((method) => (
              <Button
                key={method.id}
                className="w-full"
                variant={method.code === 'cash' ? 'default' : 'outline'}
                disabled={loading || cart.length === 0}
                onClick={() => handlePaymentClick(method)}
              >
                {method.code === 'credit' ? 'آجل على العميل' : `الدفع ${method.nameAr}`}
              </Button>
            ))}
        </div>
      </div>

      {confirmMethod && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmMethod(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">تأكيد {confirmMethod.nameAr}</h2>
            <p className="text-gray-600">
              تأكد من استلام المبلغ <strong><Signed value={total}>{total.toFixed(2)}</Signed></strong> عبر {confirmMethod.nameAr}{' '}
              قبل تأكيد الفاتورة.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setConfirmMethod(null)}>
                إلغاء
              </Button>
              <Button onClick={() => finalizeSale(confirmMethod.id)} disabled={loading}>
                {loading ? 'جاري التأكيد...' : printEnabled ? 'تأكيد وطباعة' : 'تأكيد'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
