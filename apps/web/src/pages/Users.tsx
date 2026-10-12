import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { FeatureLocked } from '@/components/ui/feature-locked';

interface RoleRef {
  id: string;
  name: string;
  nameAr: string;
}
interface TenantUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  isActive: boolean;
  branchId?: string | null;
  warehouseId?: string | null;
  accessAllBranches?: boolean;
  allowedBranchIds?: string[];
  allowedWarehouseIds?: string[];
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  lockedUntil?: string | null;
  roles: RoleRef[];
}
interface Role {
  id: string;
  name: string;
  nameAr: string;
  description?: string;
  isSystem: boolean;
  usersCount: number;
  permissions: string[];
}
interface PermissionInfo {
  name: string;
  label: string;
  category: string;
  categoryLabel: string;
}
interface Location {
  id: string;
  name: string;
  isMain?: boolean;
  isActive?: boolean;
  branchId?: string | null;
}

const emptyUser = {
  id: '',
  email: '',
  fullName: '',
  phone: '',
  password: '',
  roleIds: [] as string[],
  branchId: '',
  warehouseId: '',
  // الوصول للفروع/المخازن: كل الفروع (زي التاجر الأساسي) أو فروع ومخازن محددة
  accessAllBranches: true,
  allowedBranchIds: [] as string[],
  allowedWarehouseIds: [] as string[],
};
const emptyRole = { id: '', name: '', nameAr: '', description: '', permissions: [] as string[] };

function formatDate(v?: string | null) {
  return v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function UsersPage() {
  const { has } = usePermissions();
  const canViewUsers = has('users.view');
  const canManageRoles = has('roles.manage');
  const [tab, setTab] = useState<'users' | 'roles'>(canViewUsers ? 'users' : 'roles');

  if (!canViewUsers && !canManageRoles) {
    return (
      <FeatureLocked title="المستخدمين والصلاحيات" message="ليس لديك صلاحية لعرض هذه الصفحة." />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المستخدمين والصلاحيات</h1>
        <div className="flex gap-2">
          {canViewUsers && (
            <button
              onClick={() => setTab('users')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tab === 'users' ? 'bg-primary text-white' : 'border bg-white'}`}
            >
              <UsersIcon className="h-4 w-4" /> المستخدمين
            </button>
          )}
          {(canManageRoles || canViewUsers) && (
            <button
              onClick={() => setTab('roles')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tab === 'roles' ? 'bg-primary text-white' : 'border bg-white'}`}
            >
              <ShieldCheck className="h-4 w-4" /> الأدوار
            </button>
          )}
        </div>
      </div>
      {tab === 'users' ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

// ============================================================================ Users
function UsersTab() {
  const { has } = usePermissions();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [limits, setLimits] = useState<{ maxUsers: number | null; activeUsers: number }>({
    maxUsers: null,
    activeUsers: 0,
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Location[]>([]);
  const [form, setForm] = useState(emptyUser);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    const res = await api.get('/users');
    setUsers(res.data.data.users);
    setLimits(res.data.data.limits);
  };

  useEffect(() => {
    load().catch(() => {});
    api
      .get('/roles')
      .then((r) => setRoles(r.data.data))
      .catch(() => {});
    api
      .get('/branches')
      .then((r) => setBranches(r.data.data))
      .catch(() => {});
    api
      .get('/warehouses', { params: { all: 1 } })
      .then((r) => setWarehouses(r.data.data))
      .catch(() => {});
  }, []);

  const atLimit = limits.maxUsers !== null && limits.activeUsers >= limits.maxUsers;

  const openCreate = () => {
    setForm({ ...emptyUser });
    setShowForm(true);
  };
  const openEdit = (u: TenantUser) => {
    setForm({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone || '',
      password: '',
      roleIds: u.roles.map((r) => r.id),
      branchId: u.branchId || '',
      warehouseId: u.warehouseId || '',
      accessAllBranches: u.accessAllBranches !== false,
      allowedBranchIds: u.allowedBranchIds || [],
      allowedWarehouseIds: u.allowedWarehouseIds || [],
    });
    setShowForm(true);
  };

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const warehouseName = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const ownerRoleId = roles.find((r) => r.name === 'owner')?.id;
  const formIsOwner = !!ownerRoleId && form.roleIds.includes(ownerRoleId);
  const showAccess = branches.length > 1 || warehouses.length > 1;

  // اختيار فرع بيختار مخازنه تلقائياً، وإلغاؤه بيشيل مخازنه
  const toggleBranch = (branchId: string, checked: boolean) => {
    const own = warehouses.filter((w) => w.branchId === branchId).map((w) => w.id);
    setForm((f) =>
      checked
        ? {
            ...f,
            allowedBranchIds: Array.from(new Set([...f.allowedBranchIds, branchId])),
            allowedWarehouseIds: Array.from(new Set([...f.allowedWarehouseIds, ...own])),
          }
        : {
            ...f,
            allowedBranchIds: f.allowedBranchIds.filter((id) => id !== branchId),
            allowedWarehouseIds: f.allowedWarehouseIds.filter((id) => !own.includes(id)),
            branchId: f.branchId === branchId ? '' : f.branchId,
            warehouseId: own.includes(f.warehouseId) ? '' : f.warehouseId,
          }
    );
  };
  const toggleWarehouse = (warehouseId: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      allowedWarehouseIds: checked
        ? Array.from(new Set([...f.allowedWarehouseIds, warehouseId]))
        : f.allowedWarehouseIds.filter((id) => id !== warehouseId),
      warehouseId: !checked && f.warehouseId === warehouseId ? '' : f.warehouseId,
    }));
  };

  const describeAccess = (u: TenantUser) => {
    if (u.roles.some((r) => r.name === 'owner'))
      return <span className="text-xs font-medium text-amber-700">كل الفروع (مالك)</span>;
    if (u.accessAllBranches !== false) return <span className="text-xs">كل الفروع والمخازن</span>;
    const b = (u.allowedBranchIds || []).map((id) => branchName.get(id)).filter(Boolean);
    const w = (u.allowedWarehouseIds || []).map((id) => warehouseName.get(id)).filter(Boolean);
    return (
      <div className="text-xs leading-5">
        <div>
          <span className="text-gray-500">الفروع:</span> {b.length ? b.join('، ') : '—'}
        </div>
        <div>
          <span className="text-gray-500">المخازن:</span>{' '}
          {w.length ? w.join('، ') : <span className="text-orange-600">ولا مخزن</span>}
        </div>
      </div>
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roleIds.length) {
      toast.error('اختار دور واحد على الأقل');
      return;
    }
    const restricted = showAccess && !formIsOwner && !form.accessAllBranches;
    if (restricted && form.allowedBranchIds.length === 0) {
      toast.error('اختار فرع واحد على الأقل، أو اختار «كل الفروع والمخازن»');
      return;
    }
    if (restricted && form.branchId && !form.allowedBranchIds.includes(form.branchId)) {
      toast.error('الفرع الافتراضي لازم يكون من الفروع المسموحة');
      return;
    }
    if (restricted && form.warehouseId && !form.allowedWarehouseIds.includes(form.warehouseId)) {
      toast.error('المخزن الافتراضي لازم يكون من المخازن المسموحة');
      return;
    }
    setSaving(true);
    try {
      const common = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        roleIds: form.roleIds,
        branchId: form.branchId || null,
        warehouseId: form.warehouseId || null,
        ...(showAccess && !formIsOwner
          ? {
              accessAllBranches: form.accessAllBranches,
              allowedBranchIds: form.accessAllBranches ? [] : form.allowedBranchIds,
              allowedWarehouseIds: form.accessAllBranches ? [] : form.allowedWarehouseIds,
            }
          : {}),
      };
      if (form.id) {
        await api.put(`/users/${form.id}`, common);
        toast.success('تم تحديث المستخدم');
      } else {
        await api.post('/users', { ...common, email: form.email.trim(), password: form.password });
        toast.success('تم إضافة المستخدم');
      }
      setShowForm(false);
      await load();
    } catch {
      /* toast من الـ interceptor */
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: TenantUser) => {
    if (
      u.isActive &&
      !window.confirm(`إيقاف حساب ${u.fullName}؟ هيتم تسجيل خروجه من كل الأجهزة فوراً.`)
    )
      return;
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب');
      await load();
    } catch {
      /* interceptor */
    }
  };

  const revoke = async (u: TenantUser) => {
    if (!window.confirm(`تسجيل خروج ${u.fullName} من كل الأجهزة؟`)) return;
    try {
      await api.post(`/users/${u.id}/revoke-sessions`);
      toast.success('تم تسجيل الخروج من كل الأجهزة');
    } catch {
      /* interceptor */
    }
  };

  const remove = async (u: TenantUser) => {
    if (!window.confirm(`حذف المستخدم ${u.fullName} نهائياً؟`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('تم حذف المستخدم');
      await load();
    } catch {
      /* interceptor */
    }
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    try {
      await api.post(`/users/${resetFor.id}/reset-password`, { newPassword });
      toast.success('تم تغيير كلمة المرور وتسجيل خروج المستخدم من كل الأجهزة');
      setResetFor(null);
      setNewPassword('');
    } catch {
      /* interceptor */
    }
  };

  const toggleRole = (id: string) =>
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id],
    }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          المستخدمين النشطين:{' '}
          <span className="font-semibold text-gray-800">{limits.activeUsers}</span>
          {limits.maxUsers !== null && (
            <>
              {' '}
              من <span className="font-semibold text-gray-800">{limits.maxUsers}</span> (حد باقتك)
            </>
          )}
        </p>
        {has('users.create') && (
          <Button
            onClick={openCreate}
            disabled={atLimit}
            title={atLimit ? 'وصلت للحد الأقصى للمستخدمين' : undefined}
          >
            <Plus className="me-2 h-4 w-4" /> مستخدم جديد
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">الاسم</th>
              <th className="p-3 text-right">البريد</th>
              <th className="p-3 text-right">الأدوار</th>
              {showAccess && <th className="p-3 text-right">الفروع والمخازن</th>}
              <th className="p-3 text-right">آخر دخول</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">
                    {u.fullName}
                    {isMe && (
                      <span className="ms-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        أنت
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600" dir="ltr">
                    {u.email}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r.id}
                          className={`rounded px-2 py-0.5 text-xs ${r.name === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}
                        >
                          {r.nameAr}
                        </span>
                      ))}
                    </div>
                  </td>
                  {showAccess && <td className="p-3">{describeAccess(u)}</td>}
                  <td className="p-3 text-xs text-gray-500">
                    {formatDate(u.lastLoginAt)}
                    {u.lastLoginIp && <div dir="ltr">{u.lastLoginIp}</div>}
                  </td>
                  <td className="p-3">
                    {u.lockedUntil ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        مقفل مؤقتاً
                      </span>
                    ) : u.isActive ? (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        نشط
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        موقوف
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {has('users.update') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="تعديل"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {has('users.update') && !isMe && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="تغيير كلمة المرور"
                          onClick={() => {
                            setResetFor(u);
                            setNewPassword('');
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      {has('users.update') && !isMe && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title={u.isActive ? 'إيقاف' : 'تفعيل'}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? (
                            <UserX className="h-4 w-4 text-orange-600" />
                          ) : (
                            <UserCheck className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                      )}
                      {has('users.update') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="تسجيل خروج من كل الأجهزة"
                          onClick={() => revoke(u)}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      )}
                      {has('users.delete') && !isMe && (
                        <Button size="icon" variant="ghost" title="حذف" onClick={() => remove(u)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan={showAccess ? 7 : 6} className="p-6 text-center text-gray-400">
                  لا يوجد مستخدمين
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showForm}
        title={form.id ? 'تعديل مستخدم' : 'مستخدم جديد'}
        onClose={() => setShowForm(false)}
      >
        <form id="user-form" onSubmit={save} className="space-y-3">
          <div>
            <Label>الاسم بالكامل</Label>
            <Input
              required
              minLength={2}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          {!form.id && (
            <div>
              <Label>البريد الإلكتروني (اسم الدخول)</Label>
              <Input
                required
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          )}
          <div>
            <Label>الموبايل</Label>
            <Input
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          {!form.id && (
            <div>
              <Label>كلمة المرور</Label>
              <Input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">8 أحرف على الأقل وفيها حروف وأرقام</p>
            </div>
          )}
          <div>
            <Label>الأدوار</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-sm ${form.roleIds.includes(r.id) ? 'border-primary bg-primary/5' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                  />
                  {r.nameAr}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              مش هتقدر تمنح دور فيه صلاحيات أعلى من صلاحياتك.
            </p>
          </div>
          {branches.length > 1 && (
            <div>
              <Label>الفرع</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                <option value="">— كل الفروع —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {warehouses.length > 1 && (
            <div>
              <Label>المخزن الافتراضي</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              >
                <option value="">— بدون —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {showAccess &&
            (formIsOwner ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> المالك بيشوف كل الفروع والمخازن
                دايماً.
              </div>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">يتعامل على أنهي فروع ومخازن؟</p>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={form.accessAllBranches}
                    onChange={() => setForm({ ...form, accessAllBranches: true })}
                  />
                  <span>
                    <strong>كل الفروع والمخازن</strong>
                    <span className="block text-xs text-gray-500">
                      يشوف بيانات كل الفروع والمخازن زي التاجر الأساسي (حسب صلاحيات أدواره)
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={!form.accessAllBranches}
                    onChange={() => setForm({ ...form, accessAllBranches: false })}
                  />
                  <span>
                    <strong>فروع ومخازن محددة</strong>
                    <span className="block text-xs text-gray-500">
                      مش هيشوف ولا يسجل أي بيانات غير بتاعة الفروع والمخازن اللي هتختارها
                    </span>
                  </span>
                </label>
                {!form.accessAllBranches && (
                  <div className="space-y-2 ps-6">
                    {branches.map((b) => {
                      const own = warehouses.filter((w) => w.branchId === b.id);
                      const checked = form.allowedBranchIds.includes(b.id);
                      return (
                        <div key={b.id} className="rounded border p-2">
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleBranch(b.id, e.target.checked)}
                            />
                            {b.name}
                            {b.isMain && (
                              <span className="text-[11px] font-normal text-gray-500">(رئيسي)</span>
                            )}
                          </label>
                          {own.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 ps-6">
                              {own.map((w) => (
                                <label
                                  key={w.id}
                                  className={`flex cursor-pointer items-center gap-1.5 text-xs ${checked ? '' : 'opacity-50'}`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!checked}
                                    checked={form.allowedWarehouseIds.includes(w.id)}
                                    onChange={(e) => toggleWarehouse(w.id, e.target.checked)}
                                  />
                                  {w.name}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
            إلغاء
          </Button>
          <Button type="submit" form="user-form" disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!resetFor}
        title={`تغيير كلمة مرور ${resetFor?.fullName || ''}`}
        onClose={() => setResetFor(null)}
      >
        <form onSubmit={doReset} className="space-y-3">
          <div>
            <Label>كلمة المرور الجديدة</Label>
            <Input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            المستخدم هيتسجل خروجه من كل الأجهزة ولازم يدخل بكلمة المرور الجديدة.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setResetFor(null)}>
              إلغاء
            </Button>
            <Button type="submit">تغيير</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ============================================================================ Roles
function RolesTab() {
  const { has, permissions: myPerms, isOwner } = usePermissions();
  const canManage = has('roles.manage');
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [form, setForm] = useState(emptyRole);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await api.get('/roles');
    setRoles(r.data.data);
  };
  useEffect(() => {
    load().catch(() => {});
    if (canManage)
      api
        .get('/roles/permissions')
        .then((r) => setCatalog(r.data.data))
        .catch(() => {});
  }, [canManage]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: PermissionInfo[] }>();
    for (const p of catalog) {
      if (!map.has(p.category)) map.set(p.category, { label: p.categoryLabel, items: [] });
      map.get(p.category)!.items.push(p);
    }
    return Array.from(map.values());
  }, [catalog]);
  const labelOf = (name: string) => catalog.find((p) => p.name === name)?.label || name;
  const canGrant = (perm: string) => isOwner || myPerms.has(perm);

  const openCreate = () => {
    setForm({ ...emptyRole });
    setShowForm(true);
  };
  const openEdit = (r: Role) => {
    setForm({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      description: r.description || '',
      permissions: [...r.permissions],
    });
    setShowForm(true);
  };
  const toggle = (perm: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }));
  const toggleGroup = (items: PermissionInfo[], on: boolean) =>
    setForm((f) => {
      const names = items.map((i) => i.name).filter(canGrant);
      const set = new Set(f.permissions);
      names.forEach((n) => (on ? set.add(n) : set.delete(n)));
      return { ...f, permissions: Array.from(set) };
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id)
        await api.put(`/roles/${form.id}`, {
          nameAr: form.nameAr,
          description: form.description,
          permissions: form.permissions,
        });
      else
        await api.post('/roles', {
          name: form.name.trim(),
          nameAr: form.nameAr.trim(),
          description: form.description,
          permissions: form.permissions,
        });
      toast.success('تم حفظ الدور');
      setShowForm(false);
      await load();
    } catch {
      /* interceptor */
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Role) => {
    if (!window.confirm(`حذف الدور "${r.nameAr}"؟`)) return;
    try {
      await api.delete(`/roles/${r.id}`);
      toast.success('تم حذف الدور');
      await load();
    } catch {
      /* interceptor */
    }
  };

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" /> دور جديد
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <div key={r.id} className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{r.nameAr}</h3>
                <p className="text-xs text-gray-400" dir="ltr">
                  {r.name}
                </p>
              </div>
              {r.isSystem && (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  دور النظام
                </span>
              )}
            </div>
            {r.description && <p className="mb-2 text-sm text-gray-500">{r.description}</p>}
            <p className="mb-3 text-xs text-gray-500">
              {r.permissions.length} صلاحية · {r.usersCount} مستخدم
            </p>
            <div className="mb-3 flex max-h-24 flex-wrap gap-1 overflow-hidden">
              {r.permissions.slice(0, 12).map((p) => (
                <span
                  key={p}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
                >
                  {labelOf(p)}
                </span>
              ))}
              {r.permissions.length > 12 && (
                <span className="text-[11px] text-gray-400">+{r.permissions.length - 12}</span>
              )}
            </div>
            {canManage && !r.isSystem && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                  <Pencil className="me-1 h-3.5 w-3.5" /> تعديل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(r)}
                  disabled={r.usersCount > 0}
                  title={r.usersCount > 0 ? 'الدور مستخدم' : undefined}
                >
                  <Trash2 className="me-1 h-3.5 w-3.5 text-red-600" /> حذف
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        open={showForm}
        wide
        title={form.id ? `تعديل الدور: ${form.nameAr}` : 'دور جديد'}
        onClose={() => setShowForm(false)}
      >
        <form id="role-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>اسم الدور (عربي)</Label>
              <Input
                required
                minLength={2}
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                placeholder="مثلاً: كاشير الفرع"
              />
            </div>
            {!form.id && (
              <div>
                <Label>الاسم البرمجي (إنجليزي)</Label>
                <Input
                  required
                  dir="ltr"
                  pattern="[A-Za-z0-9_\-]+"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="branch_cashier"
                />
              </div>
            )}
          </div>
          <div>
            <Label>وصف</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-3">
            {grouped.map((g) => {
              const allOn = g.items
                .filter((i) => canGrant(i.name))
                .every((i) => form.permissions.includes(i.name));
              return (
                <div key={g.label} className="rounded-lg border">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                    <span className="text-sm font-semibold">{g.label}</span>
                    <button
                      type="button"
                      className="text-xs text-primary"
                      onClick={() => toggleGroup(g.items, !allOn)}
                    >
                      {allOn ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  <div className="grid gap-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((p) => {
                      const allowed = canGrant(p.name);
                      return (
                        <label
                          key={p.name}
                          className={`flex items-center gap-2 text-sm ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                          title={allowed ? p.name : 'لا تملك هذه الصلاحية'}
                        >
                          <input
                            type="checkbox"
                            disabled={!allowed}
                            checked={form.permissions.includes(p.name)}
                            onChange={() => toggle(p.name)}
                          />
                          {p.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </form>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{form.permissions.length} صلاحية محددة</span>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
            <Button type="submit" form="role-form" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ الدور'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
