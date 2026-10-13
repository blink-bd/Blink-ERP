import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, RefreshCw, X } from 'lucide-react';
import { defaultWorkingWarehouseId, useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';
import { useFeature } from '@/contexts/FeaturesContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/datetime';

interface Branch {
  id: string;
  name: string;
  isActive?: boolean;
}
interface Warehouse {
  id: string;
  name: string;
  branchId?: string;
  isActive: boolean;
}
interface Product {
  id: string;
  name: string;
  sku?: string;
  trackInventory: boolean;
}
interface TransferItem {
  productId: string;
  quantity: string;
}
interface Transfer {
  id: string;
  transferNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  notes?: string;
  sourceBranch?: Branch;
  destinationBranch?: Branch;
  sourceWarehouse?: Warehouse;
  destinationWarehouse?: Warehouse;
  items: Array<{ id: string; productId: string; quantity: number; product?: Product }>;
}

const statusLabel: Record<Transfer['status'], string> = {
  pending: 'بانتظار الموافقة',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
};

export function TransfersPage() {
  const { user } = useAuth();
  const transfersEnabled = useFeature('inventory.transfers');
  const { workspace, loading: workspaceLoading, reload: reloadWorkspace } = useWorkspace();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [items, setItems] = useState<TransferItem[]>([{ productId: '', quantity: '1' }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | Transfer['status']>('all');
  const [rejecting, setRejecting] = useState<Transfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseBranch, setNewWarehouseBranch] = useState('');
  const [unlinkedWarehouseId, setUnlinkedWarehouseId] = useState('');
  const [assignBranchId, setAssignBranchId] = useState('');
  const [settingUp, setSettingUp] = useState(false);

  const workspaceBranches = workspace?.branches;
  const preferredSourceId = defaultWorkingWarehouseId(workspace);

  const load = useCallback(async () => {
    if (workspaceLoading) return;
    setLoading(true);
    try {
      // الفروع من بيانات فرع العمل (مش محتاجة صلاحية «عرض الفروع» ولا ميزة الفروع
      // المتعددة)، ومن /branches كاحتياطي بس.
      const branchRequest = workspaceBranches
        ? Promise.resolve(workspaceBranches as Branch[])
        : api
            .get('/branches')
            .then((response) => (response.data.data || []) as Branch[])
            .catch(() => [] as Branch[]);
      const [branchRows, warehouseResponse, productResponse, transferResponse] = await Promise.all([
        branchRequest,
        api.get('/warehouses'),
        api.get('/products', { params: { limit: 200 } }),
        transfersEnabled
          ? api.get('/inventory/transfers')
          : Promise.resolve({ data: { data: [] } }),
      ]);
      const activeWarehouses = (warehouseResponse.data.data || []).filter(
        (item: Warehouse) => item.isActive
      );
      const activeBranches = branchRows.filter((branch: Branch) => branch.isActive !== false);
      const activeBranchIds = new Set(activeBranches.map((branch: Branch) => branch.id));
      const transferWarehouses = activeWarehouses.filter(
        (warehouse: Warehouse) => warehouse.branchId && activeBranchIds.has(warehouse.branchId)
      );
      setBranches(activeBranches);
      setWarehouses(activeWarehouses);
      setNewWarehouseBranch((previous) =>
        activeBranches.some((branch: Branch) => branch.id === previous)
          ? previous
          : activeBranches[0]?.id || ''
      );
      setAssignBranchId((previous) =>
        activeBranches.some((branch: Branch) => branch.id === previous)
          ? previous
          : activeBranches[0]?.id || ''
      );
      setUnlinkedWarehouseId((previous) =>
        previous &&
        activeWarehouses.some(
          (warehouse: Warehouse) => warehouse.id === previous && !warehouse.branchId
        )
          ? previous
          : activeWarehouses.find((warehouse: Warehouse) => !warehouse.branchId)?.id || ''
      );
      setProducts(
        (productResponse.data.data || []).filter((product: Product) => product.trackInventory)
      );
      setTransfers(transferResponse.data.data || []);
      // المصدر الافتراضي = مخزن العمل الحالي (أو الافتراضي)، والوجهة = أول مخزن تاني.
      const defaultSource =
        transferWarehouses.find((warehouse: Warehouse) => warehouse.id === preferredSourceId)?.id ||
        transferWarehouses[0]?.id ||
        '';
      setSourceWarehouseId((previous) =>
        transferWarehouses.some((warehouse: Warehouse) => warehouse.id === previous)
          ? previous
          : defaultSource
      );
      setDestinationWarehouseId((previous) =>
        transferWarehouses.some((warehouse: Warehouse) => warehouse.id === previous) ? previous : ''
      );
    } catch {
      // تظهر رسالة الخطأ عبر عميل API.
    } finally {
      setLoading(false);
    }
  }, [workspaceLoading, workspaceBranches, preferredSourceId, transfersEnabled]);

  // الوجهة لازم تبقى مخزن غير المصدر.
  useEffect(() => {
    if (
      !sourceWarehouseId ||
      (destinationWarehouseId && destinationWarehouseId !== sourceWarehouseId)
    )
      return;
    const sourceBranchId = warehouses.find((w) => w.id === sourceWarehouseId)?.branchId;
    const candidates = warehouses.filter(
      (warehouse) =>
        warehouse.id !== sourceWarehouseId &&
        warehouse.branchId &&
        branches.some((branch) => branch.id === warehouse.branchId)
    );
    // التحويل بيبقى بين فرعين مختلفين، فبنفضّل مخزن في فرع تاني.
    const otherBranch = candidates.find((warehouse) => warehouse.branchId !== sourceBranchId);
    setDestinationWarehouseId((otherBranch || candidates[0])?.id || '');
  }, [sourceWarehouseId, destinationWarehouseId, warehouses, branches]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches]
  );
  const availableWarehouses = useMemo(
    () =>
      warehouses.filter((warehouse) => warehouse.branchId && branchById.has(warehouse.branchId)),
    [warehouses, branchById]
  );
  const unlinkedWarehouses = useMemo(
    () => warehouses.filter((warehouse) => !warehouse.branchId),
    [warehouses]
  );
  const visibleTransfers = useMemo(
    () =>
      filter === 'all' ? transfers : transfers.filter((transfer) => transfer.status === filter),
    [filter, transfers]
  );

  const addItem = () => setItems((previous) => [...previous, { productId: '', quantity: '1' }]);
  const updateItem = (index: number, patch: Partial<TransferItem>) =>
    setItems((previous) =>
      previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  const removeItem = (index: number) =>
    setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index));

  const createBranch = async (event: FormEvent) => {
    event.preventDefault();
    if (!newBranchName.trim()) return;
    setSettingUp(true);
    try {
      const response = await api.post('/branches', {
        name: newBranchName.trim(),
        code: newBranchCode.trim() || undefined,
      });
      const branchId = response.data.data.id;
      setNewBranchName('');
      setNewBranchCode('');
      setNewWarehouseBranch(branchId);
      setAssignBranchId(branchId);
      toast.success('تم إنشاء الفرع. اربط به مخزناً أو أنشئ مخزناً جديداً.');
      // صفحة «فرع العمل» في القائمة بتظهر أول ما يبقى فيه أكتر من فرع/مخزن
      await Promise.all([load(), reloadWorkspace()]);
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setSettingUp(false);
    }
  };

  const createWarehouse = async (event: FormEvent) => {
    event.preventDefault();
    if (!newWarehouseBranch || !newWarehouseName.trim()) {
      toast.error('اختر الفرع واكتب اسم المخزن');
      return;
    }
    setSettingUp(true);
    try {
      await api.post('/warehouses', {
        branchId: newWarehouseBranch,
        name: newWarehouseName.trim(),
      });
      setNewWarehouseName('');
      toast.success('تم إنشاء المخزن وربطه بالفرع');
      // صفحة «فرع العمل» في القائمة بتظهر أول ما يبقى فيه أكتر من فرع/مخزن
      await Promise.all([load(), reloadWorkspace()]);
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setSettingUp(false);
    }
  };

  const linkWarehouse = async (event: FormEvent) => {
    event.preventDefault();
    if (!unlinkedWarehouseId || !assignBranchId) {
      toast.error('اختر مخزناً وفرعاً');
      return;
    }
    setSettingUp(true);
    try {
      await api.put(`/warehouses/${unlinkedWarehouseId}`, { branchId: assignBranchId });
      toast.success('تم ربط المخزن بالفرع');
      // صفحة «فرع العمل» في القائمة بتظهر أول ما يبقى فيه أكتر من فرع/مخزن
      await Promise.all([load(), reloadWorkspace()]);
    } catch {
      // يعرض عميل API رسالة الخطأ.
    } finally {
      setSettingUp(false);
    }
  };

  const createTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!sourceWarehouseId || !destinationWarehouseId) {
      toast.error('اختر مخزنين مرتبطين بفرعين مختلفين');
      return;
    }
    const payloadItems = items
      .filter((item) => item.productId && Number(item.quantity) > 0)
      .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }));
    if (!payloadItems.length) {
      toast.error('أضف صنفاً واحداً على الأقل');
      return;
    }
    setSaving(true);
    try {
      await api.post('/inventory/transfers', {
        sourceWarehouseId,
        destinationWarehouseId,
        items: payloadItems,
        notes: notes.trim() || undefined,
      });
      toast.success('تم إنشاء الطلب وحجز الكمية حتى الموافقة أو الرفض');
      setItems([{ productId: '', quantity: '1' }]);
      setNotes('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const approve = async (transfer: Transfer) => {
    if (!window.confirm(`اعتماد تحويل ${transfer.transferNumber}؟ سيتم نقل الكميات بين المخزنين.`))
      return;
    try {
      await api.post(`/inventory/transfers/${transfer.id}/approve`);
      toast.success('تم اعتماد التحويل');
      await load();
    } catch {
      // تظهر رسالة الخطأ عبر عميل API.
    }
  };

  const reject = async () => {
    if (!rejecting || !rejectReason.trim()) {
      toast.error('اكتب سبب الرفض');
      return;
    }
    try {
      await api.post(`/inventory/transfers/${rejecting.id}/reject`, {
        reason: rejectReason.trim(),
      });
      toast.success('تم رفض الطلب وتحرير الكمية المحجوزة');
      setRejecting(null);
      setRejectReason('');
      await load();
    } catch {
      // تظهر رسالة الخطأ عبر عميل API.
    }
  };

  const warehouseLabel = (warehouse?: Warehouse, branch?: Branch) =>
    [branch?.name, warehouse?.name].filter(Boolean).join(' — ') || '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">تحويلات المخزون بين الفروع</h1>
          <p className="mt-1 text-sm text-gray-500">
            يُحجز الرصيد عند الطلب ولا ينتقل فعلياً إلا بعد موافقة مستخدم آخر.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="ml-2 h-4 w-4" /> تحديث
        </Button>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">إعداد الفروع والمخازن</h2>
        <p className="mb-4 text-sm text-gray-500">
          اربط مخزناً بكل فرع؛ يمكن ربط المخزن الرئيسي الحالي بفرع بدلاً من نقل رصيده.
        </p>
        <div className="grid gap-5 lg:grid-cols-3">
          <form onSubmit={createBranch} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">إنشاء فرع</h3>
            <div>
              <Label>اسم الفرع</Label>
              <Input
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                required
                maxLength={255}
              />
            </div>
            <div>
              <Label>رمز الفرع (اختياري)</Label>
              <Input
                value={newBranchCode}
                onChange={(event) => setNewBranchCode(event.target.value)}
                maxLength={50}
              />
            </div>
            <Button type="submit" variant="outline" disabled={settingUp}>
              {settingUp ? 'جاري الحفظ…' : 'إضافة فرع'}
            </Button>
          </form>

          <form onSubmit={createWarehouse} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">إنشاء مخزن لفرع</h3>
            <div>
              <Label>الفرع</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={newWarehouseBranch}
                onChange={(event) => setNewWarehouseBranch(event.target.value)}
                disabled={!branches.length}
              >
                <option value="">{branches.length ? 'اختر الفرع' : 'أنشئ فرعاً أولاً'}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>اسم المخزن</Label>
              <Input
                value={newWarehouseName}
                onChange={(event) => setNewWarehouseName(event.target.value)}
                required
                maxLength={255}
              />
            </div>
            <Button type="submit" variant="outline" disabled={settingUp || !branches.length}>
              {settingUp ? 'جاري الحفظ…' : 'إضافة مخزن'}
            </Button>
          </form>

          <form onSubmit={linkWarehouse} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">ربط مخزن غير مرتبط</h3>
            {unlinkedWarehouses.length ? (
              <>
                <div>
                  <Label>المخزن</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border px-3"
                    value={unlinkedWarehouseId}
                    onChange={(event) => setUnlinkedWarehouseId(event.target.value)}
                  >
                    {unlinkedWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>الفرع</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border px-3"
                    value={assignBranchId}
                    onChange={(event) => setAssignBranchId(event.target.value)}
                    disabled={!branches.length}
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="outline" disabled={settingUp || !branches.length}>
                  ربط المخزن
                </Button>
              </>
            ) : (
              <p className="text-sm text-gray-400">كل المخازن الحالية مرتبطة بفروع.</p>
            )}
          </form>
        </div>
      </section>

      {!transfersEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          التحويلات بين الفروع مش مفعّلة لحسابك. تقدر تدير الفروع والمخازن من فوق، ولتفعيل التحويلات
          تواصل مع إدارة النظام.
        </div>
      )}
      {transfersEnabled && (
        <>
          <form onSubmit={createTransfer} className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <ArrowRightLeft className="h-5 w-5 text-primary" /> طلب تحويل جديد
            </h2>
            {availableWarehouses.length < 2 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                يلزم إنشاء فرعين على الأقل وربط مخزن نشط بكل فرع قبل طلب التحويل.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>من الفرع / المخزن</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border px-3"
                      value={sourceWarehouseId}
                      onChange={(event) => setSourceWarehouseId(event.target.value)}
                    >
                      {availableWarehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouseLabel(warehouse, branchById.get(warehouse.branchId || ''))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>إلى الفرع / المخزن</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border px-3"
                      value={destinationWarehouseId}
                      onChange={(event) => setDestinationWarehouseId(event.target.value)}
                    >
                      {availableWarehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouseLabel(warehouse, branchById.get(warehouse.branchId || ''))}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {sourceWarehouseId &&
                  destinationWarehouseId &&
                  branchById.get(
                    warehouses.find((warehouse) => warehouse.id === sourceWarehouseId)?.branchId ||
                      ''
                  )?.id ===
                    branchById.get(
                      warehouses.find((warehouse) => warehouse.id === destinationWarehouseId)
                        ?.branchId || ''
                    )?.id && <p className="mt-2 text-sm text-red-600">اختر فرعين مختلفين.</p>}

                <div className="mt-5 space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_150px_40px]">
                      <select
                        className="h-10 rounded-md border px-3"
                        value={item.productId}
                        onChange={(event) => updateItem(index, { productId: event.target.value })}
                      >
                        <option value="">اختر الصنف</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.sku ? ` — ${product.sku}` : ''}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: event.target.value })}
                        aria-label="الكمية"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={items.length === 1}
                        onClick={() => removeItem(index)}
                        aria-label="حذف الصنف"
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    إضافة صنف
                  </Button>
                </div>
                <div className="mt-4">
                  <Label>ملاحظات (اختياري)</Label>
                  <Input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    placeholder="سبب التحويل أو تعليمات الاستلام"
                  />
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">لا يمكن لمُنشئ الطلب اعتماده بنفسه.</p>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'جاري إنشاء الطلب…' : 'إرسال للموافقة'}
                  </Button>
                </div>
              </>
            )}
          </form>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">سجل التحويلات</h2>
              <div className="flex flex-wrap gap-2">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status)}
                    className={`rounded-full px-3 py-1 text-sm ${filter === status ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {status === 'all' ? 'الكل' : statusLabel[status]}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <p className="py-8 text-center text-gray-500">جاري تحميل التحويلات…</p>
            ) : visibleTransfers.length === 0 ? (
              <p className="py-8 text-center text-gray-500">لا توجد تحويلات في هذا القسم.</p>
            ) : (
              <div className="space-y-3">
                {visibleTransfers.map((transfer) => {
                  const canApprove =
                    transfer.status === 'pending' && transfer.createdBy !== user?.id;
                  return (
                    <article key={transfer.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold">{transfer.transferNumber}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${transfer.status === 'pending' ? 'bg-amber-100 text-amber-800' : transfer.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
                            >
                              {statusLabel[transfer.status]}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            من: {warehouseLabel(transfer.sourceWarehouse, transfer.sourceBranch)}
                          </p>
                          <p className="text-sm text-gray-600">
                            إلى:{' '}
                            {warehouseLabel(
                              transfer.destinationWarehouse,
                              transfer.destinationBranch
                            )}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {formatDateTime(transfer.createdAt)}
                          </p>
                        </div>
                        {canApprove && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => void approve(transfer)}>
                              <Check className="ml-1 h-4 w-4" /> موافقة
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejecting(transfer);
                                setRejectReason('');
                              }}
                            >
                              <X className="ml-1 h-4 w-4" /> رفض
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {transfer.items?.map((item) => (
                          <span key={item.id} className="rounded bg-gray-50 px-2 py-1 text-xs">
                            {item.product?.name || item.productId} × {Number(item.quantity)}
                          </span>
                        ))}
                      </div>
                      {transfer.notes && (
                        <p className="mt-2 text-sm text-gray-500">ملاحظة: {transfer.notes}</p>
                      )}
                      {transfer.rejectionReason && (
                        <p className="mt-2 text-sm text-red-600">
                          سبب الرفض: {transfer.rejectionReason}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setRejecting(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold">رفض طلب {rejecting.transferNumber}</h2>
            <div>
              <Label>سبب الرفض</Label>
              <Input
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                maxLength={1000}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                إلغاء
              </Button>
              <Button onClick={() => void reject()}>تأكيد الرفض</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
