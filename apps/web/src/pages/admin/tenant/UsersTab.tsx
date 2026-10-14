import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Copy,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
} from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Badge, EmptyState, Section, Skeleton, fmtDate, fmtDateTime, timeAgo } from '../ui';

const ROLE_LABELS: Record<string, string> = {
  owner: 'صاحب النشاط',
  admin: 'مدير',
  manager: 'مدير فرع',
  cashier: 'كاشير',
  accountant: 'محاسب',
};

/** كلمة مرور قوية سهلة القراءة (من غير حروف متشابهة). */
function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!'];
  const all = sets.join('');
  const random = (max: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  };
  const chars = sets.map((s) => s[random(s.length)]);
  while (chars.length < 14) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface UserForm {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  isActive: boolean;
  roleIds: string[];
  accessAllBranches: boolean;
  allowedBranchIds: string[];
  allowedWarehouseIds: string[];
  branchId?: string | null;
  warehouseId?: string | null;
}

interface PermissionOption {
  name: string;
  label: string;
  category: string;
  categoryLabel: string;
}

interface NewRoleForm {
  name: string;
  nameAr: string;
  description: string;
  permissions: string[];
}

const emptyRoleForm = (): NewRoleForm => ({
  name: '',
  nameAr: '',
  description: '',
  permissions: [],
});

const emptyForm = (): UserForm => ({
  fullName: '',
  email: '',
  phone: '',
  password: generatePassword(),
  isActive: true,
  roleIds: [],
  accessAllBranches: true,
  allowedBranchIds: [],
  allowedWarehouseIds: [],
});

const copy = (text: string) => {
  navigator.clipboard?.writeText(text).catch(() => undefined);
};

export function UsersTab({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [users, setUsers] = useState<any[] | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionOption[]>([]);
  const [permissionCatalogLoading, setPermissionCatalogLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [form, setForm] = useState<UserForm | null>(null);
  const [roleForm, setRoleForm] = useState<NewRoleForm>(emptyRoleForm);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [resetFor, setResetFor] = useState<any | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await adminApi.get(`/admin/tenants/${id}/users`);
    setUsers(r.data.data);
  };
  useEffect(() => {
    setUsers(null);
    setRoles([]);
    setPermissionCatalog([]);
    setPermissionCatalogLoading(true);
    load().catch(() => setUsers([]));
    adminApi
      .get(`/admin/tenants/${id}/roles`)
      .then((r) => setRoles(r.data.data))
      .catch(() => undefined);
    adminApi
      .get(`/admin/tenants/${id}/permissions`)
      .then((r) => setPermissionCatalog(r.data.data))
      .catch(() => setPermissionCatalog([]))
      .finally(() => setPermissionCatalogLoading(false));
    adminApi
      .get(`/admin/tenants/${id}/branches`)
      .then((r) => setBranches(r.data.data))
      .catch(() => undefined);
  }, [id]);

  const ownerRoleId = useMemo(() => roles.find((r) => r.name === 'owner')?.id, [roles]);
  const formIsOwner = !!form && !!ownerRoleId && form.roleIds.includes(ownerRoleId);
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: PermissionOption[] }>();
    for (const permission of permissionCatalog) {
      if (!groups.has(permission.category)) {
        groups.set(permission.category, { label: permission.categoryLabel, items: [] });
      }
      groups.get(permission.category)!.items.push(permission);
    }
    return Array.from(groups.values());
  }, [permissionCatalog]);
  const refresh = () => {
    load();
    onSaved();
  };

  const openCreate = () => setForm(emptyForm());
  const openEdit = (u: any) =>
    setForm({
      id: u.id,
      fullName: u.fullName || '',
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      isActive: !!u.isActive,
      roleIds: (u.roles || []).map((r: any) => r.id).filter(Boolean),
      accessAllBranches: u.accessAllBranches !== false,
      allowedBranchIds: u.allowedBranchIds || [],
      allowedWarehouseIds: u.allowedWarehouseIds || [],
      branchId: u.branchId || null,
      warehouseId: u.warehouseId || null,
    });

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const openRoleCreate = () => {
    setRoleForm(emptyRoleForm());
    setShowRoleForm(true);
  };

  const toggleRolePermission = (permission: string) =>
    setRoleForm((current) => {
      const next = new Set(current.permissions);
      if (next.has(permission)) {
        next.delete(permission);
        if (permission === 'maintenance.view') next.delete('maintenance.create');
      } else {
        next.add(permission);
        if (permission === 'maintenance.create') next.add('maintenance.view');
      }
      return { ...current, permissions: Array.from(next) };
    });

  const togglePermissionGroup = (items: PermissionOption[], enabled: boolean) =>
    setRoleForm((current) => {
      const next = new Set(current.permissions);
      items.forEach((permission) =>
        enabled ? next.add(permission.name) : next.delete(permission.name)
      );
      return { ...current, permissions: Array.from(next) };
    });

  const saveRole = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = roleForm.name.trim().toLowerCase();
    const nameAr = roleForm.nameAr.trim();
    if (nameAr.length < 2) return toast.error('اكتب اسم الدور بالعربي');
    if (!/^[a-z0-9_-]{2,100}$/i.test(name)) {
      return toast.error('اكتب الاسم البرمجي بحروف إنجليزية أو أرقام أو _ أو -');
    }
    if (permissionCatalogLoading) return toast.error('استنى تحميل قائمة الصلاحيات');
    if (!permissionCatalog.length) return toast.error('تعذر تحميل الصلاحيات المتاحة');

    setSavingRole(true);
    try {
      const response = await adminApi.post(`/admin/tenants/${id}/roles`, {
        name,
        nameAr,
        description: roleForm.description.trim() || undefined,
        permissions: roleForm.permissions,
      });
      const createdRole = response.data.data;
      const availableRole = {
        ...createdRole,
        permissionsCount: createdRole.permissions?.length ?? 0,
      };
      setRoles((current) =>
        current.some((role) => role.id === availableRole.id)
          ? current
          : [...current, availableRole]
      );
      setForm((current) =>
        current
          ? { ...current, roleIds: Array.from(new Set([...current.roleIds, availableRole.id])) }
          : current
      );
      setShowRoleForm(false);
      setRoleForm(emptyRoleForm());
      toast.success('تم إنشاء الدور، وبقى متاحاً لاختياره عند إضافة مستخدم');
    } catch {
      // handled by interceptor
    } finally {
      setSavingRole(false);
    }
  };

  const toggleBranch = (branchId: string) => {
    if (!form) return;
    const removing = form.allowedBranchIds.includes(branchId);
    const branchWarehouses = (branches.find((b) => b.id === branchId)?.warehouses || []).map(
      (w: any) => w.id
    );
    setForm({
      ...form,
      allowedBranchIds: toggleIn(form.allowedBranchIds, branchId),
      // شيل الفرع = شيل مخازنه؛ إضافة الفرع = كل مخازنه (تقدر تشيل منها بعد كده).
      // المخزن المشترك يفضل مختار لو فرع تاني من فروع المستخدم بيستخدمه.
      allowedWarehouseIds: removing
        ? form.allowedWarehouseIds.filter(
            (w) =>
              !branchWarehouses.includes(w) ||
              branches.some(
                (b) =>
                  b.id !== branchId &&
                  form.allowedBranchIds.includes(b.id) &&
                  (b.warehouses || []).some((x: any) => x.id === w)
              )
          )
        : Array.from(new Set([...form.allowedWarehouseIds, ...branchWarehouses])),
    });
  };

  const save = async () => {
    if (!form) return;
    if (form.fullName.trim().length < 2) return toast.error('اكتب اسم المستخدم');
    if (!form.email.trim()) return toast.error('اكتب البريد الإلكتروني');
    if (!form.id && form.password.length < 8) return toast.error('كلمة المرور 8 أحرف على الأقل');
    if (!form.roleIds.length) return toast.error('اختار دور واحد على الأقل');
    if (!formIsOwner && !form.accessAllBranches && !form.allowedBranchIds.length) {
      return toast.error('اختار فرع واحد على الأقل أو «كل الفروع»');
    }
    const access = formIsOwner
      ? {}
      : {
          accessAllBranches: form.accessAllBranches,
          allowedBranchIds: form.accessAllBranches ? [] : form.allowedBranchIds,
          allowedWarehouseIds: form.accessAllBranches ? [] : form.allowedWarehouseIds,
          // الفرع/المخزن الافتراضي لازم يكونوا ضمن المسموح — لو خرجوا بره نشيلهم.
          ...(!form.accessAllBranches &&
          form.branchId &&
          !form.allowedBranchIds.includes(form.branchId)
            ? { branchId: null }
            : {}),
          ...(!form.accessAllBranches &&
          form.warehouseId &&
          !form.allowedWarehouseIds.includes(form.warehouseId)
            ? { warehouseId: null }
            : {}),
        };
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.put(`/admin/tenants/${id}/users/${form.id}`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          isActive: form.isActive,
          roleIds: form.roleIds,
          ...access,
        });
        toast.success('تم حفظ بيانات المستخدم');
      } else {
        await adminApi.post(`/admin/tenants/${id}/users`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          roleIds: form.roleIds,
          ...access,
        });
        copy(`${form.email.trim()}\n${form.password}`);
        toast.success('تم إضافة المستخدم ونسخ بيانات الدخول — ابعتها له', { duration: 6000 });
      }
      setForm(null);
      refresh();
    } catch {
      // الرسالة ظهرت من الـ interceptor
    } finally {
      setSaving(false);
    }
  };

  const openReset = (u: any) => {
    setResetFor(u);
    setPassword(generatePassword());
  };

  const doReset = async () => {
    if (!resetFor || password.length < 8) {
      toast.error('كلمة المرور لازم 8 أحرف على الأقل');
      return;
    }
    setSaving(true);
    try {
      await adminApi.post(`/admin/tenants/${id}/reset-user-password`, {
        userId: resetFor.id,
        newPassword: password,
      });
      copy(password);
      toast.success('تم تغيير كلمة المرور ونسخها — ابعتها للمستخدم. اتعمله خروج من كل الأجهزة.', {
        duration: 6000,
      });
      setResetFor(null);
      setPassword('');
      load();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (u: any, isActive: boolean) => {
    if (!isActive && !window.confirm(`إيقاف ${u.fullName}؟ مش هيقدر يدخل لحد ما تفعّله تاني.`))
      return;
    try {
      await adminApi.put(`/admin/tenants/${id}/users/${u.id}`, { isActive });
      toast.success(isActive ? 'تم التفعيل' : 'تم الإيقاف');
      refresh();
    } catch {
      // handled by interceptor
    }
  };

  const remove = async (u: any) => {
    if (!window.confirm(`حذف المستخدم ${u.fullName} نهائياً؟`)) return;
    try {
      await adminApi.delete(`/admin/tenants/${id}/users/${u.id}`);
      toast.success('تم حذف المستخدم');
      refresh();
    } catch {
      // handled by interceptor
    }
  };

  const revoke = async (userId: string) => {
    if (!window.confirm('هيتم تسجيل خروج المستخدم ده من كل الأجهزة. متأكد؟')) return;
    await adminApi.post(`/admin/tenants/${id}/users/${userId}/revoke-sessions`);
    toast.success('تم تسجيل خروجه من كل الأجهزة');
  };

  const unlock = async (userId: string) => {
    await adminApi.post(`/admin/tenants/${id}/users/${userId}/unlock`);
    toast.success('تم فك القفل');
    refresh();
  };

  const branchName = (branchId: string) => branches.find((b) => b.id === branchId)?.name;

  if (!users) return <Skeleton className="h-64" />;

  return (
    <Section
      title={`المستخدمين (${users.length})`}
      description="كل بيانات مستخدمي التاجر من هنا: البيانات، الأدوار، الفروع، كلمة المرور، الإيقاف والحذف. التاجر وموظفينه مش بيغيروا كلمات المرور بنفسهم."
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openRoleCreate}>
            <Plus className="ml-1 h-4 w-4" /> دور جديد
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="ml-1 h-4 w-4" /> مستخدم جديد
          </Button>
        </div>
      }
    >
      {users.length === 0 ? (
        <EmptyState>مفيش مستخدمين</EmptyState>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            const isOwner = (u.roles || []).some((r: any) => r.name === 'owner');
            const branchLabel =
              isOwner || u.accessAllBranches
                ? 'كل الفروع'
                : (u.allowedBranchIds || []).map(branchName).filter(Boolean).join('، ') ||
                  `${u.allowedBranches} فرع`;
            return (
              <div key={u.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{u.fullName}</span>
                      {(u.roles || []).map((r: any) => (
                        <Badge key={r.id || r.name} tone={r.name === 'owner' ? 'violet' : 'blue'}>
                          {r.nameAr || ROLE_LABELS[r.name] || r.name}
                        </Badge>
                      ))}
                      {locked ? (
                        <Badge tone="red">مقفول مؤقتاً</Badge>
                      ) : u.isActive ? (
                        <Badge tone="green">نشط</Badge>
                      ) : (
                        <Badge tone="slate">موقوف</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <button
                        type="button"
                        className="hover:text-slate-800"
                        dir="ltr"
                        title="نسخ البريد"
                        onClick={() => {
                          copy(u.email);
                          toast.success('اتنسخ البريد');
                        }}
                      >
                        {u.email}
                      </button>
                      {u.phone && <span dir="ltr">{u.phone}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {locked && (
                      <Button size="sm" variant="outline" onClick={() => unlock(u.id)}>
                        <Unlock className="ml-1 h-4 w-4" /> فك القفل
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                      <Pencil className="ml-1 h-4 w-4" /> تعديل
                    </Button>
                    <Button size="sm" onClick={() => openReset(u)}>
                      <KeyRound className="ml-1 h-4 w-4" /> كلمة المرور
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="خروج من كل الأجهزة"
                      onClick={() => revoke(u.id)}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={u.isActive ? 'إيقاف' : 'تفعيل'}
                      onClick={() => setActive(u, !u.isActive)}
                    >
                      {u.isActive ? (
                        <UserX className="h-4 w-4 text-orange-600" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-emerald-600" />
                      )}
                    </Button>
                    <Button size="icon" variant="ghost" title="حذف" onClick={() => remove(u)}>
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                  <Info
                    label="آخر دخول"
                    value={u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'عمره ما دخل'}
                    title={fmtDateTime(u.lastLoginAt)}
                  />
                  <Info
                    label="آخر IP"
                    value={
                      <span dir="ltr" className="font-mono">
                        {u.lastLoginIp || '—'}
                      </span>
                    }
                  />
                  <Info
                    label="آخر تغيير لكلمة المرور"
                    value={u.passwordChangedAt ? timeAgo(u.passwordChangedAt) : '—'}
                    title={fmtDateTime(u.passwordChangedAt)}
                  />
                  <Info label="الفروع" value={branchLabel} />
                  <Info label="اتضاف في" value={fmtDate(u.createdAt)} />
                  <Info
                    label="محاولات فاشلة متتالية"
                    value={
                      <span className={u.failedLoginAttempts > 0 ? 'text-rose-600' : ''}>
                        {u.failedLoginAttempts || 0}
                      </span>
                    }
                  />
                </div>

                {resetFor?.id === u.id && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="mb-2 text-xs text-slate-500">
                      كلمة المرور الجديدة (اتولدت تلقائياً — تقدر تكتب غيرها):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="w-56 font-mono"
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPassword(generatePassword())}
                        title="توليد جديدة"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          copy(password);
                          toast.success('اتنسخت');
                        }}
                        title="نسخ"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={doReset} disabled={saving}>
                        {saving ? 'جاري الحفظ...' : 'حفظ'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetFor(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!form}
        title={form?.id ? `تعديل ${form.fullName || 'المستخدم'}` : 'مستخدم جديد'}
        onClose={() => setForm(null)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'جاري الحفظ...' : form?.id ? 'حفظ التعديلات' : 'إضافة المستخدم'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>الاسم</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </div>
              <div>
                <Label>البريد الإلكتروني (للدخول)</Label>
                <Input
                  dir="ltr"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {form.id && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    لو غيّرته، المستخدم هيتعمله خروج ويدخل بالبريد الجديد.
                  </p>
                )}
              </div>
              <div>
                <Label>الموبايل</Label>
                <Input
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              {form.id ? (
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                    الحساب نشط (يقدر يدخل)
                  </label>
                </div>
              ) : (
                <div>
                  <Label>كلمة المرور</Label>
                  <div className="flex gap-1">
                    <Input
                      dir="ltr"
                      className="font-mono"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="توليد جديدة"
                      onClick={() => setForm({ ...form, password: generatePassword() })}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>الأدوار</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      form.roleIds.includes(r.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.roleIds.includes(r.id)}
                      onChange={() => setForm({ ...form, roleIds: toggleIn(form.roleIds, r.id) })}
                    />
                    {r.nameAr || ROLE_LABELS[r.name] || r.name}
                  </label>
                ))}
                {!roles.length && (
                  <span className="text-sm text-slate-400">جاري تحميل الأدوار...</span>
                )}
              </div>
            </div>

            <div>
              <Label>الفروع والمخازن</Label>
              {formIsOwner ? (
                <p className="mt-2 text-sm text-slate-500">
                  صاحب النشاط بيشوف كل الفروع والمخازن دايماً.
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.accessAllBranches}
                      onChange={(e) => setForm({ ...form, accessAllBranches: e.target.checked })}
                    />
                    كل الفروع والمخازن
                  </label>
                  {!form.accessAllBranches && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {branches.map((b) => (
                        <div key={b.id} className="rounded-lg border border-slate-200 p-3">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={form.allowedBranchIds.includes(b.id)}
                              onChange={() => toggleBranch(b.id)}
                            />
                            {b.name}
                          </label>
                          {form.allowedBranchIds.includes(b.id) &&
                            (b.warehouses || []).length > 0 && (
                              <div className="mt-2 space-y-1 pr-6">
                                {b.warehouses.map((w: any) => (
                                  <label
                                    key={w.id}
                                    className="flex items-center gap-2 text-xs text-slate-600"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={form.allowedWarehouseIds.includes(w.id)}
                                      onChange={() =>
                                        setForm({
                                          ...form,
                                          allowedWarehouseIds: toggleIn(
                                            form.allowedWarehouseIds,
                                            w.id
                                          ),
                                        })
                                      }
                                    />
                                    {w.name}
                                    {w.shared && <span className="text-indigo-600">(مشترك)</span>}
                                  </label>
                                ))}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showRoleForm}
        title="إنشاء دور جديد للتاجر"
        onClose={() => setShowRoleForm(false)}
        wide
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setShowRoleForm(false)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              form="tenant-role-form"
              disabled={savingRole || permissionCatalogLoading || !permissionCatalog.length}
            >
              {savingRole ? 'جاري إنشاء الدور...' : 'إنشاء الدور'}
            </Button>
          </>
        }
      >
        <form id="tenant-role-form" onSubmit={saveRole} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>اسم الدور بالعربي</Label>
              <Input
                required
                minLength={2}
                maxLength={100}
                value={roleForm.nameAr}
                onChange={(event) => setRoleForm({ ...roleForm, nameAr: event.target.value })}
                placeholder="مثال: مسؤول الصيانة"
              />
            </div>
            <div>
              <Label>الاسم البرمجي</Label>
              <Input
                required
                dir="ltr"
                minLength={2}
                maxLength={100}
                pattern="[A-Za-z0-9_\\-]+"
                value={roleForm.name}
                onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })}
                placeholder="مثال: maintenance_staff"
              />
              <p className="mt-1 text-xs text-slate-400">
                حروف إنجليزية أو أرقام أو شرطة سفلية أو عادية.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>وصف الدور (اختياري)</Label>
              <Input
                maxLength={500}
                value={roleForm.description}
                onChange={(event) =>
                  setRoleForm({ ...roleForm, description: event.target.value })
                }
                placeholder="مثال: عرض فواتير الصيانة وتسجيل فواتير جديدة"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>الصلاحيات</Label>
              <span className="text-xs text-slate-500">
                {roleForm.permissions.length} صلاحية محددة
              </span>
            </div>
            {permissionCatalogLoading ? (
              <p className="rounded-lg border p-4 text-sm text-slate-500">
                جاري تحميل قائمة الصلاحيات...
              </p>
            ) : permissionGroups.length ? (
              <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                {permissionGroups.map((group) => {
                  const allSelected =
                    group.items.length > 0 &&
                    group.items.every((permission) =>
                      roleForm.permissions.includes(permission.name)
                    );
                  return (
                    <div key={group.label} className="rounded-lg border">
                      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                        <span className="text-sm font-semibold">{group.label}</span>
                        <button
                          type="button"
                          className="text-xs text-primary"
                          onClick={() => togglePermissionGroup(group.items, !allSelected)}
                        >
                          {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
                        </button>
                      </div>
                      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map((permission) => (
                          <label
                            key={permission.name}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={roleForm.permissions.includes(permission.name)}
                              onChange={() => toggleRolePermission(permission.name)}
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border p-4 text-sm text-slate-500">
                مفيش صلاحيات متاحة حالياً.
              </p>
            )}
          </div>
        </form>
      </Modal>
    </Section>
  );
}

function Info({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2" title={title}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 font-medium text-slate-700">{value}</div>
    </div>
  );
}
