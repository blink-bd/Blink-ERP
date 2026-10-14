import { useCallback, useEffect, useState } from 'react';
import { Signed } from '@/lib/signed';
import { RefreshCw, SearchCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { useFeature } from '@/contexts/FeaturesContext';
import { formatDateTime } from '@/lib/datetime';

type Disposition = 'supplier' | 'restocked' | 'original' | 'write_off';

interface ReturnItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
  disposition: 'pending' | 'supplier' | 'restocked' | 'original' | 'write_off';
  product?: { name: string; sku?: string; barcode?: string; unit?: string };
}

interface SaleReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  total: number;
  invoiceCredit?: number;
  refundPaid?: number;
  accountCredit?: number;
  reason?: string;
  status: string;
  originalSale?: { saleNumber: string; customerId?: string };
  items: ReturnItem[];
}

interface ItemDraft {
  disposition: Disposition;
  supplierId: string;
  repairExpense: string;
  repairDescription: string;
  wasteExpense: string;
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
  const maintenanceEnabled = useFeature('maintenance_management');

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
      repairDescription: '',
      wasteExpense: '0',
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
    const isWriteOff = draft.disposition === 'write_off';
    const payload: any = {
      disposition: draft.disposition,
      // الهالك/الإتلاف بيحسب الخسارة بنفسه من التكلفة الأصلية، فمش بنبعته خانات يدوية
      // عشان الخسارة متتحسبش مرتين.
      repairExpense: isWriteOff ? 0 : Number(draft.repairExpense) || 0,
      repairDescription: isWriteOff ? undefined : draft.repairDescription.trim() || undefined,
      wasteExpense: isWriteOff ? 0 : Number(draft.wasteExpense) || 0,
    };
    if (draft.disposition === 'supplier') {
      payload.supplierId = draft.supplierId;
    } else if (draft.disposition === 'restocked') {
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
      const res = await api.post(
        `/sales/returns/${saleReturn.id}/items/${item.id}/disposition`,
        payload
      );
      const result = res.data.data || {};
      // في الهالك/الإتلاف الرسالة الأساسية فيها الخسارة أصلاً، فمفيش تفاصيل إضافية.
      const extra = isWriteOff
        ? []
        : [
            result.maintenanceInvoiceId ? 'واتسجلت الصيانة في «إدارة الصيانة»' : '',
            Number(result.writeDown) > 0
              ? `واتسجل فرق التقييم ${Number(result.writeDown).toFixed(2)} هالك`
              : '',
          ].filter(Boolean);
      const message =
        draft.disposition === 'supplier'
          ? 'تم تسجيل الإرجاع للمورد وتحديث رصيده'
          : draft.disposition === 'original'
            ? 'رجعت الكمية للمخزون على نفس الصنف وبقت متاحة للبيع'
            : isWriteOff
              ? `الكمية خرجت من المخزون واتسجلت خسارة ${Number(result.wasteExpense || 0).toFixed(2)} ج.م`
              : 'تم إنشاء الصنف المستقل وإضافته للمخزون';
      toast.success(message + (extra.length ? ` ${extra.join(' ')}` : ''), { duration: 6000 });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر حفظ قرار فحص المرتجع');
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
            راجع الصنف: رجّعه المخزن لو سليم، أو أعده للمورد، أو اعمل له بطاقة مستقلة
            (مستعمل/مفتوح)، أو سجّله هالك/إتلاف لو باظ تماماً وهيرمي.
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
                    {formatDateTime(saleReturn.returnDate)}
                    {saleReturn.reason ? ` · السبب: ${saleReturn.reason}` : ''}
                  </p>
                </div>
                <div className="text-left text-sm">
                  <div className="font-semibold">
                    إجمالي المرتجع: <Signed value={Number(saleReturn.total)}>{Number(saleReturn.total).toFixed(2)}</Signed> ج.م
                  </div>
                  <div className="mt-1 space-x-2 text-xs text-gray-500 rtl:space-x-reverse">
                    {Number(saleReturn.invoiceCredit) > 0 && (
                      <span>خصم من الفاتورة <Signed value={Number(saleReturn.invoiceCredit)}>{Number(saleReturn.invoiceCredit).toFixed(2)}</Signed></span>
                    )}
                    {Number(saleReturn.accountCredit) > 0 && (
                      <span>
                        خصم من مديونية العميل <Signed value={Number(saleReturn.accountCredit)}>{Number(saleReturn.accountCredit).toFixed(2)}</Signed>
                      </span>
                    )}
                    {Number(saleReturn.refundPaid) > 0 && (
                      <span>مردود للعميل <Signed value={Number(saleReturn.refundPaid)}>{Number(saleReturn.refundPaid).toFixed(2)}</Signed></span>
                    )}
                  </div>
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
                              <Signed value={Number(item.unitPrice)}>{Number(item.unitPrice).toFixed(2)}</Signed> ج.م · التكلفة الأصلية:{' '}
                              <Signed value={Number(item.unitCost)}>{Number(item.unitCost).toFixed(2)}</Signed> ج.م
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              إجمالي القيمة: <Signed value={Number(item.total)}>{Number(item.total).toFixed(2)}</Signed> ج.م
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={draft.disposition === 'original' ? 'default' : 'outline'}
                              onClick={() => updateDraft(item, { disposition: 'original' })}
                            >
                              رجوع على نفس الصنف
                            </Button>
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
                            <Button
                              type="button"
                              size="sm"
                              variant={draft.disposition === 'write_off' ? 'destructive' : 'outline'}
                              onClick={() => updateDraft(item, { disposition: 'write_off' })}
                            >
                              هالك / إتلاف
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
                                <Signed value={(Number(item.unitCost) * Number(item.quantity))}>{(Number(item.unitCost) * Number(item.quantity)).toFixed(2)}</Signed> ج.م
                              </strong>
                              .
                            </div>
                          </div>
                        ) : draft.disposition === 'original' ? (
                          <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">
                            الصنف سليم وهيرجع المخزن على نفس الصنف الأصلي
                            {item.product?.sku ? ` (${item.product.sku})` : ''} بتكلفته الأصلية{' '}
                            <Signed value={Number(item.unitCost)}>{Number(item.unitCost).toFixed(2)}</Signed> ج.م، والكمية ({Number(item.quantity)})
                            هتبقى متاحة للبيع تاني فوراً.
                          </p>
                        ) : draft.disposition === 'write_off' ? (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            <p className="font-semibold">الصنف تالف ومش هيتباع تاني</p>
                            <ul className="mt-2 list-disc space-y-1 pr-5 text-xs">
                              <li>الكمية ({Number(item.quantity)}) هتتشال من المخزون نهائياً.</li>
                              <li>
                                خسارة بقيمة التكلفة الأصلية{' '}
                                <strong>
                                  <Signed value={(Number(item.unitCost) * Number(item.quantity))}>{(Number(item.unitCost) * Number(item.quantity)).toFixed(2)}</Signed> ج.م
                                </strong>{' '}
                                هتتحسب لوحدها مصروف وتظهر في الأرباح.
                              </li>
                              <li>مش هيتعمل صنف جديد، ومش محتاج تملأ أي خانة تانية.</li>
                            </ul>
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

                        {draft.disposition === 'restocked' &&
                          Number(draft.costPrice) < Number(item.unitCost) && (
                            <p className="rounded bg-amber-50 p-2 text-xs text-amber-700">
                              التكلفة الجديدة أقل من التكلفة الأصلية؛ الفرق (
                              {(
                                (Number(item.unitCost) - Number(draft.costPrice)) *
                                Number(item.quantity)
                              ).toFixed(2)}{' '}
                              ج.م) هيتسجل هالك تلقائياً عشان يظهر في الأرباح.
                            </p>
                          )}

                        {draft.disposition === 'write_off' ? (
                          <p className="border-t pt-3 text-xs text-gray-500">
                            مفيش خانات تانية في حالة الهالك/الإتلاف — الخسارة بتتحسب لوحدها فوق.
                          </p>
                        ) : (
                          <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
                            <div>
                              <Label>إصلاح الصنف — دفعت كام؟ (اختياري)</Label>
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
                                فلوس دفعتها عشان تصلّح الصنف ويرجع يتباع.
                              </p>
                            </div>
                            <div>
                              <Label>إيه اللي اتعمل في الصنف؟</Label>
                              <Input
                                value={draft.repairDescription}
                                placeholder="مثال: تغيير شاشة"
                                onChange={(event) =>
                                  updateDraft(item, { repairDescription: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label>خسارة جزئية في الصنف (اختياري)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.wasteExpense}
                                onChange={(event) =>
                                  updateDraft(item, { wasteExpense: event.target.value })
                                }
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                نقص في قيمة الصنف مش هيتعوض — كسر أو خدش. سيبها صفر لو مفيش.
                              </p>
                            </div>
                          </div>
                        )}

                        <details className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <summary className="cursor-pointer font-medium text-gray-700">
                            مش فاهم الخانات؟ اضغط هنا للشرح
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pr-5 leading-relaxed">
                            <li>
                              <strong>رجوع على نفس الصنف</strong>: الصنف سليم — يرجع المخزن ويتباع
                              تاني بنفس تكلفته، ومفيش خسارة.
                            </li>
                            <li>
                              <strong>إرجاع لمورد</strong>: البضاعة ترجع للمورد وقيمتها تتخصم من
                              حسابه عندك.
                            </li>
                            <li>
                              <strong>إنشاء صنف مستقل</strong>: الصنف اتفتح أو اتخدش وهيتباع بسعر
                              أقل — بيتعمل له بطاقة جديدة باسم وكود وسعر جديد. لو تكلفته الجديدة
                              أقل من الأصلية، الفرق بيتسجل خسارة لوحده.
                            </li>
                            <li>
                              <strong>هالك / إتلاف</strong>: الصنف باظ تماماً وهيرمي — الكمية تخرج
                              من المخزون وقيمتها كلها تتسجل خسارة في خطوة واحدة.
                            </li>
                            <li>
                              <strong>إصلاح الصنف</strong>: فلوس اتصرفت عشان الصنف يرجع يتباع
                              {maintenanceEnabled
                                ? ' — بتتسجل فاتورة صيانة داخلية في «إدارة الصيانة»'
                                : ' — بتتسجل مصروف على الفرع'}
                              . لو الصنف هيترمى سيبها صفر.
                            </li>
                            <li>
                              <strong>خسارة جزئية</strong>: نقص في قيمة الصنف مش هيتعوض، وده غير
                              الإتلاف الكامل. لو اخترت «هالك / إتلاف» سيبها صفر عشان الخسارة
                              متتحسبش مرتين.
                            </li>
                          </ul>
                        </details>
                        <div className="flex justify-end">
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
