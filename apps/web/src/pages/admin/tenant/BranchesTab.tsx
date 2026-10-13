import { useEffect, useState } from 'react';
import { GitBranch, MapPin, Phone, Users, Warehouse } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Badge, EmptyState, Section, Skeleton, fmtDate, fmtNumber } from '../ui';

export function BranchesTab({ id }: { id: string }) {
  const [branches, setBranches] = useState<any[] | null>(null);
  useEffect(() => {
    adminApi.get(`/admin/tenants/${id}/branches`).then((r) => setBranches(r.data.data));
  }, [id]);

  if (!branches) return <Skeleton className="h-64" />;
  const warehouses = branches.reduce((sum, b) => sum + b.warehouses.length, 0);

  return (
    <Section
      title={`${branches.length} فرع · ${warehouses} مخزن`}
      description="عمليات البيع آخر 30 يوم بالعدد بس (من غير مبالغ)."
    >
      {branches.length === 0 ? (
        <EmptyState>التاجر لسه ما ضافش فروع</EmptyState>
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
                  <p className="text-xs text-slate-400">مفيش مخازن في الفرع ده</p>
                )}
                {b.warehouses.map((w: any) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="inline-flex items-center gap-2 text-slate-700">
                      <Warehouse className="h-4 w-4 text-slate-400" />
                      {w.name}
                      {!w.isActive && <Badge tone="slate">متوقف</Badge>}
                    </span>
                    <span className="text-xs text-slate-500">
                      {fmtNumber(w.productsInStock)} صنف متاح
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
