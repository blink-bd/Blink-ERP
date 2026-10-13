import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { GitBranch, Link2, MapPin, Phone, Plus, Unlink, Users, Warehouse } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, Section, Skeleton, fmtDate, fmtNumber, selectClass } from '../ui';

interface AdminWarehouse {
  id: string;
  name: string;
  code?: string | null;
  branchId?: string | null;
  sharedBranchIds?: string[];
  isMain?: boolean;
  isActive: boolean;
}

export function BranchesTab({ id }: { id: string }) {
  const [branches, setBranches] = useState<any[] | null>(null);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [saving, setSaving] = useState('');

  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseBranch, setWarehouseBranch] = useState('');
  const [linkBranch, setLinkBranch] = useState('');
  const [linkWarehouse, setLinkWarehouse] = useState('');

  const load = useCallback(async () => {
    const [branchRows, warehouseRows] = await Promise.all([
      adminApi.get(`/admin/tenants/${id}/branches`).then((r) => r.data.data),
      adminApi.get(`/admin/tenants/${id}/warehouses`).then((r) => r.data.data),
    ]);
    setBranches(branchRows);
    setWarehouses(warehouseRows);
  }, [id]);

  useEffect(() => {
    load().catch(() => setBranches([]));
  }, [load]);

  const branchNameById = (branchId?: string | null) =>
    branches?.find((b) => b.id === branchId)?.name || 'فرع تاني';

  // المخازن اللي لسه مش مستخدمة في الفرع المختار (لا أساسية ولا مشتركة).
  const linkCandidates = warehouses.filter(
    (w) =>
      linkBranch && w.branchId !== linkBranch && !(w.sharedBranchIds || []).includes(linkBranch)
  );

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setSaving(key);
    try {
      await action();
      toast.success(success);
      await load();
    } catch {
      // رسالة الخطأ بتظهر من adminApi.
    } finally {
      setSaving('');
    }
  };

  const createBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(
      'branch',
      () =>
        adminApi.post(`/admin/tenants/${id}/branches`, {
          name: branchName.trim(),
          code: branchCode.trim() || undefined,
          phone: branchPhone.trim() || undefined,
        }),
      'تم إنشاء الفرع'
    );
    setBranchName('');
    setBranchCode('');
    setBranchPhone('');
  };

  const createWarehouse = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(
      'warehouse',
      () =>
        adminApi.post(`/admin/tenants/${id}/warehouses`, {
          name: warehouseName.trim(),
          branchId: warehouseBranch || undefined,
        }),
      'تم إنشاء المخزن وربطه بالفرع'
    );
    setWarehouseName('');
  };

  const linkWarehouseToBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(
      'link',
      () => adminApi.post(`/admin/tenants/${id}/warehouses/${linkWarehouse}/branches`, { branchId: linkBranch }),
      'تم ربط الفرع بالمخزن — الفرعين بيستخدموا نفس المخزون'
    );
    setLinkWarehouse('');
  };

  const unlink = async (warehouse: AdminWarehouse, branchId: string) => {
    if (!window.confirm(`فك ربط «${branchNameById(branchId)}» من مخزن «${warehouse.name}»؟`)) return;
    await run(
      'unlink',
      () => adminApi.delete(`/admin/tenants/${id}/warehouses/${warehouse.id}/branches/${branchId}`),
      'تم فك الربط'
    );
  };

  const changeMainBranch = async (warehouse: AdminWarehouse, branchId: string) => {
    if (!branchId) return;
    await run(
      `main-${warehouse.id}`,
      () => adminApi.put(`/admin/tenants/${id}/warehouses/${warehouse.id}`, { branchId }),
      'تم تغيير الفرع الأساسي للمخزن'
    );
  };

  const toggleActive = async (warehouse: AdminWarehouse) => {
    await run(
      `active-${warehouse.id}`,
      () =>
        adminApi.put(`/admin/tenants/${id}/warehouses/${warehouse.id}`, {
          isActive: !warehouse.isActive,
        }),
      warehouse.isActive ? 'تم إيقاف المخزن' : 'تم تفعيل المخزن'
    );
  };

  if (!branches) return <Skeleton className="h-64" />;
  // المخزن المشترك بيظهر تحت كل فرع بيستخدمه، فبنعدّه مرة واحدة بس.
  const warehouseCount = warehouses.length;

  return (
    <div className="space-y-4">
      <Section
        title="إنشاء الفروع والمخازن وربطها"
        description="التاجر مايقدرش يعمل ده من حسابه — الفروع والمخازن وربطها بيتعملوا من هنا بس."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <form onSubmit={createBranch} className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">فرع جديد</h3>
            <div>
              <Label>اسم الفرع</Label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                required
                maxLength={255}
              />
            </div>
            <div>
              <Label>رمز الفرع (اختياري)</Label>
              <Input
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                maxLength={50}
              />
            </div>
            <div>
              <Label>هاتف الفرع (اختياري)</Label>
              <Input
                dir="ltr"
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                maxLength={50}
              />
            </div>
            <Button type="submit" variant="outline" disabled={saving === 'branch' || !branchName.trim()}>
              <Plus className="ml-1 h-4 w-4" />
              {saving === 'branch' ? 'جاري الحفظ…' : 'إضافة فرع'}
            </Button>
          </form>

          <form
            onSubmit={createWarehouse}
            className="space-y-3 rounded-lg border border-slate-200 p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">مخزن جديد لفرع</h3>
            <div>
              <Label>الفرع</Label>
              <select
                className={`mt-1 ${selectClass}`}
                value={warehouseBranch}
                onChange={(e) => setWarehouseBranch(e.target.value)}
              >
                <option value="">الفرع الرئيسي (تلقائي)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>اسم المخزن</Label>
              <Input
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                required
                maxLength={255}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={saving === 'warehouse' || !warehouseName.trim()}
            >
              <Plus className="ml-1 h-4 w-4" />
              {saving === 'warehouse' ? 'جاري الحفظ…' : 'إضافة مخزن'}
            </Button>
          </form>

          <form
            onSubmit={linkWarehouseToBranch}
            className="space-y-3 rounded-lg border border-slate-200 p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">ربط فرع بمخزن موجود</h3>
            <div>
              <Label>الفرع</Label>
              <select
                className={`mt-1 ${selectClass}`}
                value={linkBranch}
                onChange={(e) => {
                  setLinkBranch(e.target.value);
                  setLinkWarehouse('');
                }}
              >
                <option value="">اختر الفرع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>المخزن</Label>
              <select
                className={`mt-1 ${selectClass}`}
                value={linkWarehouse}
                onChange={(e) => setLinkWarehouse(e.target.value)}
                disabled={!linkCandidates.length}
              >
                <option value="">
                  {!linkBranch
                    ? 'اختر الفرع الأول'
                    : linkCandidates.length
                      ? 'اختر المخزن'
                      : 'كل المخازن مربوطة بالفرع ده'}
                </option>
                {linkCandidates.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.branchId ? ` — تابع لـ ${branchNameById(w.branchId)}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                لو المخزن تابع لفرع تاني هيبقى مشترك: الفرعين يبيعوا من نفس الرصيد، وكل فاتورة
                تتسجل على فرعها.
              </p>
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={saving === 'link' || !linkBranch || !linkWarehouse}
            >
              <Link2 className="ml-1 h-4 w-4" />
              {saving === 'link' ? 'جاري الحفظ…' : 'ربط'}
            </Button>
          </form>
        </div>
      </Section>

      <Section
        title={`${branches.length} فرع · ${warehouseCount} مخزن`}
        description="عمليات البيع آخر 30 يوم بالعدد بس (من غير مبالغ)."
      >
        {branches.length === 0 ? (
          <EmptyState>التاجر لسه ما ضافش فروع — ابدأ بإضافة فرع من فوق</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {branches.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <GitBranch className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{b.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {b.code} · من {fmtDate(b.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {b.isMain && <Badge tone="violet">رئيسي</Badge>}
                    {b.isActive ? (
                      <Badge tone="green">شغال</Badge>
                    ) : (
                      <Badge tone="slate">متوقف</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {b.users} مستخدم
                  </span>
                  <span>{fmtNumber(b.operations30d)} فاتورة بيع آخر 30 يوم</span>
                  {b.phone && (
                    <span className="inline-flex items-center gap-1" dir="ltr">
                      <Phone className="h-3.5 w-3.5" />
                      {b.phone}
                    </span>
                  )}
                  {b.address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {b.address}
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1.5">
                  {b.warehouses.length === 0 && (
                    <p className="text-xs text-rose-600">
                      مالوش مخزن — مش هيقدر يبيع أو يشتري. اربطه بمخزن من فوق.
                    </p>
                  )}
                  {b.warehouses.map((w: any) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <Warehouse className="h-4 w-4 text-slate-400" />
                        {w.name}
                        {w.shared && <Badge tone="violet">مشترك من فرع تاني</Badge>}
                        {!w.shared && w.sharedBranchCount > 0 && (
                          <Badge tone="violet">مشترك مع {w.sharedBranchCount} فرع</Badge>
                        )}
                        {!w.isActive && <Badge tone="slate">متوقف</Badge>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {fmtNumber(w.productsInStock)} صنف متاح
                        </span>
                        {w.shared && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline disabled:opacity-50"
                            disabled={saving === 'unlink'}
                            onClick={() => void unlink(w, b.id)}
                          >
                            <Unlink className="h-3.5 w-3.5" /> فك الربط
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="المخازن"
        description="الفرع الأساسي للمخزن هو اللي بيتسجل عليه المخزن، والفروع المشتركة بتبيع من نفس الرصيد."
      >
        {warehouses.length === 0 ? (
          <EmptyState>مفيش مخازن</EmptyState>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="inline-flex min-w-[160px] flex-1 items-center gap-2 text-sm font-medium text-slate-800">
                  <Warehouse className="h-4 w-4 text-slate-400" />
                  {w.name}
                  {w.isMain && <Badge tone="violet">رئيسي</Badge>}
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  الفرع الأساسي
                  <select
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    value={w.branchId || ''}
                    disabled={saving === `main-${w.id}` || !branches.length}
                    onChange={(e) => void changeMainBranch(w, e.target.value)}
                  >
                    <option value="">—</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="flex flex-wrap items-center gap-1">
                  {(w.sharedBranchIds || []).map((branchId) => (
                    <span
                      key={branchId}
                      className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700"
                    >
                      {branchNameById(branchId)}
                      <button
                        type="button"
                        className="hover:underline disabled:opacity-50"
                        disabled={saving === 'unlink'}
                        onClick={() => void unlink(w, branchId)}
                      >
                        فك
                      </button>
                    </span>
                  ))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving === `active-${w.id}` || (w.isMain && w.isActive)}
                  onClick={() => void toggleActive(w)}
                >
                  {w.isActive ? 'إيقاف' : 'تفعيل'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
