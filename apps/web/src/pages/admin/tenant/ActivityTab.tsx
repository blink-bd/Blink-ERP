import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { auditLabel, severityClass } from '@/lib/audit-labels';
import { Button } from '@/components/ui/button';
import { Section, fmtDateTime, selectClass } from '../ui';

const ACTIONS = [
  'TENANT_LOGIN',
  'TENANT_LOGIN_FAILED',
  'TENANT_ACCOUNT_LOCKED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ROLES_CHANGED',
  'USER_DELETED',
  'ROLE_UPDATED',
  'API_KEY_CREATED',
  'DATA_EXPORTED',
  'DATA_IMPORTED',
];

export function ActivityTab({ id }: { id: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (action = filter) => {
    setLoading(true);
    try {
      const r = await adminApi.get(`/admin/tenants/${id}/audit-logs`, {
        params: { limit: 200, action: action || undefined },
      });
      setLogs(r.data.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load('');
  }, [id]);

  return (
    <Section
      title="سجل الأمان والنشاط"
      actions={
        <>
          <select
            className={`${selectClass} h-9 w-52`}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              load(e.target.value);
            }}
          >
            <option value="">كل الأحداث</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {auditLabel(a)}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </>
      }
    >
      <div className="-m-5 max-h-[560px] overflow-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3 text-right font-medium">الوقت</th>
              <th className="p-3 text-right font-medium">الحدث</th>
              <th className="p-3 text-right font-medium">المستخدم</th>
              <th className="p-3 text-right font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap p-3 text-xs text-slate-500">
                  {fmtDateTime(l.createdAt)}
                </td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${severityClass(l.severity)}`}>
                    {auditLabel(l.action)}
                  </span>
                </td>
                <td className="p-3 text-xs" dir="ltr">
                  {l.userEmail || '—'}
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">
                  {l.ip || '—'}
                </td>
              </tr>
            ))}
            {!logs.length && !loading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400">
                  لا يوجد نشاط مسجل
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
