import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, SearchCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

type Disposition = 'supplier' | 'restocked';

interface ReturnItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
  disposition: 'pending' | 'supplier' | 'restocked';
  product?: { name: string; sku?: string; barcode?: string; unit?: string };
}

interface SaleReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  total: number;
  reason?: string;
  status: string;
  originalSale?: { saleNumber: string; customerId?: string };
  items: ReturnItem[];
}

interface ItemDraft {
  disposition: Disposition;
  supplierId: string;
  repairExpense: string;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  description: string;
  unit: string;
}

export function ReturnsPage() {
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [returnResponse, supplierResponse] = await Promise.all([
        api.get('/sales/returns', { params: { status: 'pending_inspection' } }),
        api.get('/suppliers'),
      ]);
      setReturns(returnResponse.data.data);
      setSuppliers(supplierResponse.data.data);
    } catch {
      toast.error('تعذر تحميل المرتجعات بانتظار الفحص');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getDraft = (item: ReturnItem): ItemDraft =>
    drafts[item.id] || {
      disposition: 'supplier',
      supplierId: '',
      repairExpense: '0',
      name: `${item.product?.name || 'صنف مرتجع'} - قطعة مرتجعة`,
      sku: '',
      barcode: '',
      costPrice: String(Number(item.unitCost) || 0),
      sellingPrice: String(Number(item.unitPrice) || 0),
      description: '',
      unit: item.product?.unit || 'قطعة',
    };

  const updateDraft = (item: ReturnItem, patch: Partial<ItemDraft>) => {
    setDrafts((current) => ({ ...current, [item.id]: { ...getDraft(item), ...patch } }));
  };

  const saveDecision = async (saleReturn: SaleReturn, item: ReturnItem) => {
    const draft = getDraft(item);
    if (draft.disposition === 'supplier' && !draft.supplierId) {
      toast.error('اختر المورد الذي ستُعاد إليه البضاعة');
      return;
    }
    if (draft.disposition === 'restocked' && !draft.sku.trim() && !draft.barcode.trim()) {
      toast.error('أدخل رمزاً أو باركود جديداً للصنف المستقل');
      return;
    }
    const payload: any = {
      disposition: draft.disposition,
      repairExpense: Number(draft.repairExpense) || 0,
    };
    if (draft.disposition === 'supplier') {
      payload.supplierId = draft.supplierId;
    } else {
      payload.product = {
        name: draft.name.trim(),
        sku: draft.sku.trim() || undefined,
        barcode: draft.barcode.trim() || undefined,
        costPrice: Number(draft.costPrice),
        sellingPrice: Number(draft.sellingPrice),
        description: draft.description.trim() || undefined,
        unit: draft.unit.trim() || undefined,
      };
    }

    setSavingItemId(item.id);
    try {
      await api.post(`/sales/returns/${saleReturn.id}/items/${item.id}/disposition`, payload);
      toast.success(
        draft.disposition === 'supplier'
          ? 'تم تسجيل الإرجاع للمورد وتحديث رصيده'
          : 'تم إنشاء الصنف المستقل وإضافته للمخزون'
      );
      await load();
    } catch {
      toast.error('تعذر حفظ قرار فحص المرتجع');
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">فحص مرتجعات المبيعات</h1>
          <p className="mt-1 text-sm text-gray-500">
            راجع سعر البيع والتكلفة، ثم أعد الصنف للمورد أو أنشئ له بطاقة مخزون مستقلة.
          </p>
        </div>
        <Button variant="outline" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-500">
          جاري تحميل المرتجعات...
        </div>
      ) : returns.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-500">
          <SearchCheck className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          لا توجد مرتجعات بانتظار الفحص.
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((saleReturn) => (
            <section
              key={saleReturn.id}
              className="overflow-hidden rounded-lg border bg-white shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-50 p-4">
                <div>
                  <h2 className="font-bold">مرتجع {saleReturn.returnNumber}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    الفاتورة: {saleReturn.originalSale?.saleNumber || '—'} ·{' '}
                    {new Date(saleReturn.returnDate).toLocaleString('ar-EG')}
                    {saleReturn.reason ? ` · السبب: ${saleReturn.reason}` : ''}
                  </p>
                </div>
                <div className="text-sm font-semibold">
                  إجمالي المرتجع: {Number(saleReturn.total).toFixed(2)} ج.م
                </div>
              </header>
              <div className="divide-y">
                {saleReturn.items
                  .filter((item) => item.disposition === 'pending')
                  .map((item) => {
                    const draft = getDraft(item);
                    const saving = savingItemId === item.id;
                    return (
                      <article key={item.id} className="space-y-4 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">{item.product?.name || 'صنف مرتجع'}</h3>
                            <p className="mt-1 text-sm text-gray-600">
                              الكمية: {Number(item.quantity)} · سعر البيع:{' '}
                              {Number(item.unitPrice).toFixed(2)} ج.م · التكلفة الأصلية:{' '}
                              {Number(item.unitCost).toFixed(2)} ج.م
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              إجمالي القيمة: {Number(item.total).toFixed(2)} ج.م
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={draft.disposition === 'supplier' ? 'default' : 'outline'}
                              onClick={() => updateDraft(item, { disposition: 'supplier' })}
                            >
                              إرجاع لمورد
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={draft.disposition === 'restocked' ? 'default' : 'outline'}
                              onClick={() => updateDraft(item, { disposition: 'restocked' })}
                            >
                              إنشاء صنف مستقل
                            </Button>
                          </div>
                        </div>

                        {draft.disposition === 'supplier' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label>المورد المختار يدوياً</Label>
                              <select
                                className="h-10 w-full rounded-md border px-3"
                                value={draft.supplierId}
                                onChange={(event) =>
                                  updateDraft(item, { supplierId: event.target.value })
                                }
                              >
                                <option value="">اختر المورد</option>
                                {suppliers.map((supplier) => (
                                  <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="rounded-md border bg-gray-50 p-3 text-sm">
                              سيُخصم من المخزون {Number(item.quantity)} وحدة، ويُخفض رصيد المورد
                              بمقدار{' '}
                              <strong>
                                {(Number(item.unitCost) * Number(item.quantity)).toFixed(2)} ج.م
                              </strong>
                              .
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <Label>اسم الصنف المستقل</Label>
                              <Input
                                value={draft.name}
                                onChange={(event) =>
                                  updateDraft(item, { name: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label>رمز جديد</Label>
                              <Input
                                value={draft.sku}
                                onChange={(event) => updateDraft(item, { sku: event.target.value })}
                                placeholder="اختياري إذا أدخلت باركود"
                              />
                            </div>
                            <div>
                              <Label>باركود جديد</Label>
                              <Input
                                value={draft.barcode}
                                onChange={(event) =>
                                  updateDraft(item, { barcode: event.target.value })
                                }
                                placeholder="اختياري إذا أدخلت رمزاً"
                              />
                            </div>
                            <div>
                              <Label>التكلفة الجديدة للوحدة</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.costPrice}
                                onChange={(event) =>
                                  updateDraft(item, { costPrice: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label>سعر البيع الجديد للوحدة</Label>
                              <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={draft.sellingPrice}
                                onChange={(event) =>
                                  updateDraft(item, { sellingPrice: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label>الوحدة</Label>
                              <Input
                                value={draft.unit}
                                onChange={(event) =>
                                  updateDraft(item, { unit: event.target.value })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <Label>وصف المنتج (اختياري)</Label>
                              <Input
                                value={draft.description}
                                onChange={(event) =>
                                  updateDraft(item, { description: event.target.value })
                                }
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                          <div className="w-full max-w-xs">
                            <Label>تكلفة صيانة أو هالك (اختياري)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.repairExpense}
                              onChange={(event) =>
                                updateDraft(item, { repairExpense: event.target.value })
                              }
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              تُسجل كمصروف معتمد على فرع الفاتورة.
                            </p>
                          </div>
                          <Button disabled={saving} onClick={() => saveDecision(saleReturn, item)}>
                            {saving ? 'جارٍ الحفظ...' : 'حفظ قرار الفحص'}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
