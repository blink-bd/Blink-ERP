import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Copy, KeyRound, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useFeature } from '@/contexts/FeaturesContext';
import { usePermissions } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { FeatureLocked } from '@/components/ui/feature-locked';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt?: string | null;
  lastUsedIp?: string | null;
  expiresAt?: string | null;
  status: 'active' | 'revoked' | 'expired';
}

const PERMISSION_LABELS: Record<string, string> = {
  'products.view': 'عرض المنتجات',
  'products.create': 'إضافة منتجات',
  'products.update': 'تعديل المنتجات (أسعار/بيانات)',
  'categories.view': 'عرض الأقسام',
  'brands.view': 'عرض الماركات',
  'inventory.view': 'عرض المخزون',
  'customers.view': 'عرض العملاء',
  'customers.create': 'إضافة عملاء',
  'customers.update': 'تعديل العملاء',
  'suppliers.view': 'عرض الموردين',
  'sales.view': 'عرض المبيعات',
  'sales.create': 'تسجيل مبيعات (طلبات المتجر الإلكتروني)',
  'purchases.view': 'عرض المشتريات',
  'reports.view': 'عرض التقارير',
};

const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function ApiKeysPage() {
  const enabled = useFeature('api_access');
  const { has, permissions: mine, isOwner } = usePermissions();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [grantable, setGrantable] = useState<string[]>(Object.keys(PERMISSION_LABELS));
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>(['products.view', 'inventory.view']);
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.get('/api-keys');
    setKeys(res.data.data);
    if (res.data.meta?.grantablePermissions) setGrantable(res.data.meta.grantablePermissions);
  };
  useEffect(() => {
    if (enabled && has('api_keys.manage')) load().catch(() => {});
  }, [enabled]);

  if (!enabled) return <FeatureLocked title="الربط عبر API" />;
  if (!has('api_keys.manage'))
    return <FeatureLocked title="مفاتيح API" message="ليس لديك صلاحية إدارة مفاتيح الـ API." />;

  const canGrant = (p: string) => isOwner || mine.has(p);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.length) {
      toast.error('اختار صلاحية واحدة على الأقل');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api-keys', {
        name: name.trim(),
        permissions: perms,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setCreatedKey(res.data.data.key);
      setShowForm(false);
      setName('');
      setExpiresAt('');
      await load();
    } catch {
      /* interceptor */
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (k: ApiKeyRow) => {
    if (!window.confirm(`إلغاء المفتاح "${k.name}" نهائياً؟ أي نظام بيستخدمه هيتوقف فوراً.`))
      return;
    try {
      await api.delete(`/api-keys/${k.id}`);
      toast.success('تم إلغاء المفتاح');
      await load();
    } catch {
      /* interceptor */
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم النسخ');
    } catch {
      toast.error('انسخ المفتاح يدوياً');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">مفاتيح الـ API</h1>
          <p className="text-sm text-gray-500">
            اربط متجرك الإلكتروني أو أي نظام خارجي بالمنتجات والمخزون والعملاء والطلبات.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="me-2 h-4 w-4" /> مفتاح جديد
        </Button>
      </div>

      <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <div>
          المفتاح زي كلمة السر بالظبط: ماتحطوش في كود الواجهة أو تبعته في شات. المفاتيح ماتقدرش تدير
          المستخدمين أو الأدوار أو النسخ الاحتياطي، وصلاحياتها دايماً أقل من أو تساوي صلاحيات اللي
          أنشأها. أرسل المفتاح في الهيدر{' '}
          <code dir="ltr" className="rounded bg-white px-1">
            X-API-Key
          </code>
          .
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right">الاسم</th>
              <th className="p-3 text-right">المفتاح</th>
              <th className="p-3 text-right">الصلاحيات</th>
              <th className="p-3 text-right">آخر استخدام</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="p-3 font-medium">
                  {k.name}
                  <div className="text-xs text-gray-400">أنشئ {fmt(k.createdAt)}</div>
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">
                  {k.keyPrefix}…
                </td>
                <td className="p-3">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {k.permissions.map((p) => (
                      <span key={p} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">
                        {PERMISSION_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {fmt(k.lastUsedAt)}
                  {k.lastUsedIp && <div dir="ltr">{k.lastUsedIp}</div>}
                </td>
                <td className="p-3">
                  {k.status === 'active' ? (
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                      نشط
                      {k.expiresAt
                        ? ` حتى ${new Date(k.expiresAt).toLocaleDateString('ar-EG')}`
                        : ''}
                    </span>
                  ) : k.status === 'expired' ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">منتهي</span>
                  ) : (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">ملغي</span>
                  )}
                </td>
                <td className="p-3">
                  {k.status === 'active' && (
                    <Button size="icon" variant="ghost" title="إلغاء" onClick={() => revoke(k)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!keys.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  <KeyRound className="mx-auto mb-2 h-8 w-8" />
                  لا توجد مفاتيح بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title="مفتاح API جديد" onClose={() => setShowForm(false)}>
        <form onSubmit={create} className="space-y-3">
          <div>
            <Label>اسم المفتاح</Label>
            <Input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: متجر Shopify"
            />
          </div>
          <div>
            <Label>تاريخ الانتهاء (اختياري)</Label>
            <Input
              type="date"
              value={expiresAt}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label>الصلاحيات (اختار أقل حاجة محتاجها التكامل)</Label>
            <div className="mt-1 space-y-1">
              {grantable.map((p) => (
                <label
                  key={p}
                  className={`flex items-center gap-2 text-sm ${canGrant(p) ? '' : 'opacity-40'}`}
                >
                  <input
                    type="checkbox"
                    disabled={!canGrant(p)}
                    checked={perms.includes(p)}
                    onChange={() =>
                      setPerms((cur) =>
                        cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]
                      )
                    }
                  />
                  {PERMISSION_LABELS[p] || p}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!createdKey} title="انسخ المفتاح الآن" onClose={() => setCreatedKey(null)}>
        <p className="mb-3 text-sm text-red-600">
          المفتاح ده هيظهر مرة واحدة بس. لو ضاع، الغيه واعمل واحد جديد.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-gray-50 p-3">
          <code className="flex-1 break-all font-mono text-xs" dir="ltr">
            {createdKey}
          </code>
          <Button size="icon" variant="outline" onClick={() => createdKey && copy(createdKey)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <pre
          className="mt-4 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100"
          dir="ltr"
        >{`curl -H "X-API-Key: ${createdKey?.slice(0, 14)}..." \\
  ${window.location.origin}/api/v1/products`}</pre>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setCreatedKey(null)}>نسخته، اقفل</Button>
        </div>
      </Modal>
    </div>
  );
}
