import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { Trash2, Plus, Minus } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice: number;
  availableQuantity?: number;
  imageUrl?: string;
}

interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  taxRate: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  nameAr: string;
  code: string;
}

export function POSPage() {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadPaymentMethods();
    loadDefaultWarehouse();
  }, []);

  const loadPaymentMethods = async () => {
    try {
      const res = await api.get('/sales/payment-methods');
      setPaymentMethods(res.data.data);
    } catch {
      // ignore — payment methods are seeded automatically per tenant on creation
    }
  };

  const loadDefaultWarehouse = async () => {
    try {
      const res = await api.get('/warehouses');
      const main = res.data.data.find((w: any) => w.isMain) || res.data.data[0];
      if (main) setWarehouseId(main.id);
    } catch {
      // ignore
    }
  };

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const taxTotal = cart.reduce((sum, l) => sum + (l.unitPrice * l.quantity * l.taxRate) / 100, 0);
  const total = subtotal + taxTotal;

  const addProductToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, unitPrice: Number(product.sellingPrice), quantity: 1, taxRate: 0 },
      ];
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await api.get(`/products/search/${encodeURIComponent(query.trim())}`);
      if (res.data.success) {
        addProductToCart(res.data.data);
        setQuery('');
      } else {
        toast.error('المنتج غير موجود');
      }
    } catch {
      toast.error('المنتج غير موجود');
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  };

  const completeSale = async (methodId: string) => {
    if (cart.length === 0) {
      toast.error('الرجاء إضافة أصناف أولاً');
      return;
    }
    if (!warehouseId) {
      toast.error('لا يوجد مخزن افتراضي — أضف مخزن أولاً من صفحة المخزون');
      return;
    }
    setLoading(true);
    try {
      await api.post('/sales', {
        warehouseId,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })),
        payments: [{ methodId, amount: total }],
      });
      toast.success('تمت عملية البيع بنجاح');
      setCart([]);
    } catch (error) {
      // toast already shown by api interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      <div className="col-span-2 flex flex-col">
        <form onSubmit={handleSearch} className="mb-4">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="امسح الباركود أو ابحث برمز المنتج..."
            className="text-lg h-14"
            autoFocus
          />
        </form>

        <div className="bg-white rounded-lg shadow flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-right p-3">المنتج</th>
                <th className="text-center p-3">الكمية</th>
                <th className="text-right p-3">السعر</th>
                <th className="text-right p-3">الإجمالي</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-12">
                    السلة فارغة — ابدأ بمسح أو البحث عن منتج
                  </td>
                </tr>
              )}
              {cart.map((line) => (
                <tr key={line.productId} className="border-t">
                  <td className="p-3">{line.name}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center">{line.quantity}</span>
                      <Button size="icon" variant="outline" onClick={() => updateQuantity(line.productId, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="p-3">{line.unitPrice.toFixed(2)}</td>
                  <td className="p-3 font-medium">{(line.unitPrice * line.quantity).toFixed(2)}</td>
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
            <span>{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>الضريبة</span>
            <span>{taxTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold pt-3 border-t mt-3">
            <span>الإجمالي</span>
            <span className="text-primary">{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2 mt-6">
          {paymentMethods.length === 0 && (
            <Button className="w-full" disabled={loading || cart.length === 0} onClick={() => completeSale('cash')}>
              دفع نقدي وإتمام البيع
            </Button>
          )}
          {paymentMethods.map((method) => (
            <Button
              key={method.id}
              className="w-full"
              variant={method.code === 'cash' ? 'default' : 'outline'}
              disabled={loading || cart.length === 0}
              onClick={() => completeSale(method.id)}
            >
              الدفع {method.nameAr}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
