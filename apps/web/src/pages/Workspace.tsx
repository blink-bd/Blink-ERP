import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, Check, Layers, MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useWorkspace,
  warehouseServesBranch,
  warehousesForBranch,
} from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';

function OptionCard({
  selected,
  onClick,
  title,
  subtitle,
  icon: Icon,
  badge,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative text-right rounded-lg border-2 p-4 bg-white transition-colors disabled:opacity-50 ${
        selected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {selected && (
        <span className="absolute top-3 left-3 rounded-full bg-primary p-1 text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${selected ? 'text-primary' : 'text-gray-400'}`} />
        <div className="min-w-0">
          <p className="font-bold truncate">
            {title}
            {badge && (
              <span className="mr-2 align-middle text-[11px] font-normal rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                {badge}
              </span>
            )}
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </button>
  );
}

export function WorkspacePage() {
  const { workspace, setWorkspace, loading } = useWorkspace();
  const { has } = usePermissions();
  const canManageLocations = has('branches.manage', 'warehouses.manage');
  const navigate = useNavigate();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setBranchId(workspace.activeBranchId);
    setWarehouseId(workspace.activeWarehouseId);
  }, [workspace?.activeBranchId, workspace?.activeWarehouseId, !!workspace]);

  const branchName = useMemo(() => {
    const map = new Map<string, string>();
    workspace?.branches.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [workspace]);

  if (loading && !workspace) return <p className="text-gray-400">جاري التحميل...</p>;
  if (!workspace) return <p className="text-gray-500">تعذر تحميل بيانات الفروع.</p>;

  const multiBranch = workspace.branches.length > 1;
  const visibleWarehouses = warehousesForBranch(workspace.warehouses, branchId);
  const changed =
    branchId !== workspace.activeBranchId || warehouseId !== workspace.activeWarehouseId;

  const selectBranch = (id: string | null) => {
    setBranchId(id);
    // لو المخزن المختار مش تابع للفرع الجديد نرجّع «كل المخازن»
    if (
      warehouseId &&
      !warehousesForBranch(workspace.warehouses, id).some((w) => w.id === warehouseId)
    ) {
      setWarehouseId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await setWorkspace(branchId, warehouseId);
      toast.success('تم تغيير فرع العمل — كل الصفحات هتعرض بيانات الاختيار ده');
      navigate('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  const selectedBranchLabel = branchId
    ? branchName.get(branchId)
    : multiBranch
      ? 'كل الفروع'
      : workspace.branches[0]?.name;
  const selectedWarehouseLabel = warehouseId
    ? workspace.warehouses.find((w) => w.id === warehouseId)?.name
    : branchId
      ? 'كل مخازن الفرع'
      : visibleWarehouses.length > 1
        ? 'كل المخازن'
        : visibleWarehouses[0]?.name;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            فرع العمل
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            اختار السيستم يشتغل على بيانات أنهي فرع ومخزن، أو اعرض كل الفروع والمخازن مع بعض.
            الاختيار بيتطبق على لوحة التحكم ونقطة البيع والمخزون والمشتريات والمصروفات والخزينة
            والتقارير.
          </p>
        </div>
        {canManageLocations && (
          <Link to="/transfers">
            <Button variant="outline">إدارة الفروع والمخازن</Button>
          </Link>
        )}
      </div>

      {!workspace.accessAll && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          انت شايف بس الفروع والمخازن اللي اتاحت لك صلاحية عليها.
        </div>
      )}

      {/* الفروع */}
      <section className="mb-8">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-gray-500" /> 1) الفرع
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {multiBranch && (
            <OptionCard
              selected={branchId === null}
              onClick={() => selectBranch(null)}
              icon={Layers}
              title={workspace.accessAll ? 'كل الفروع' : 'كل فروعي'}
              subtitle="عرض بيانات كل الفروع مجمّعة مع بعض"
            />
          )}
          {workspace.branches.map((b) => {
            const count = workspace.warehouses.filter(
              (w) => w.branchId && warehouseServesBranch(w, b.id)
            ).length;
            return (
              <OptionCard
                key={b.id}
                selected={branchId === b.id || (!multiBranch && branchId === null)}
                onClick={() => selectBranch(b.id)}
                icon={Building2}
                title={b.name}
                badge={b.isMain ? 'رئيسي' : !b.isActive ? 'موقوف' : undefined}
                subtitle={[b.city, count ? `${count} مخزن` : 'مفيش مخازن متاحة لك']
                  .filter(Boolean)
                  .join(' • ')}
              />
            );
          })}
        </div>
      </section>

      {/* المخازن */}
      <section className="mb-8">
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <WarehouseIcon className="h-5 w-5 text-gray-500" /> 2) المخزن
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          كل مخزن تابع لفرع (وممكن يكون مشترك مع فروع تانية) — لما تختار فرع بتظهر مخازنه والمخازن
          المشتركة معاه، ولما تختار «كل الفروع» بتظهر كل المخازن.
        </p>
        {visibleWarehouses.length === 0 ? (
          <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            الفرع ده مالوش مخازن متاحة لك — مش هتقدر تبيع أو تشتري عليه.
            {canManageLocations && (
              <>
                {' '}
                <Link to="/transfers" className="underline font-medium">
                  اربط مخزن بالفرع
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleWarehouses.length > 1 && (
              <OptionCard
                selected={warehouseId === null}
                onClick={() => setWarehouseId(null)}
                icon={Layers}
                title={branchId ? 'كل مخازن الفرع' : 'كل المخازن'}
                subtitle="عرض المخزون الموجود في كل المخازن دي مع بعض"
              />
            )}
            {visibleWarehouses.map((w) => (
              <OptionCard
                key={w.id}
                selected={
                  warehouseId === w.id || (visibleWarehouses.length === 1 && warehouseId === null)
                }
                onClick={() => setWarehouseId(w.id)}
                icon={WarehouseIcon}
                title={w.name}
                badge={w.isMain ? 'رئيسي' : !w.isActive ? 'موقوف' : undefined}
                subtitle={
                  w.branchId
                    ? `تابع لـ ${branchName.get(w.branchId) || 'فرع'}${
                        (w.branchIds || []).length > 1 ? ' • مخزن مشترك' : ''
                      }`
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 bg-gray-50 py-4 border-t flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">
          السيستم هيشتغل على: <strong>{selectedBranchLabel}</strong>
          {selectedWarehouseLabel && (
            <>
              {' '}
              — المخزون: <strong>{selectedWarehouseLabel}</strong>
            </>
          )}
        </p>
        <Button onClick={save} disabled={saving || !changed}>
          {saving ? 'جاري الحفظ...' : changed ? 'ابدأ الشغل على الاختيار ده' : 'ده الاختيار الحالي'}
        </Button>
      </div>
    </div>
  );
}
