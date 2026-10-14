import type { ReactNode } from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { signedTone } from '@/lib/signed';

/** عناصر واجهة مشتركة لصفحات المدير العام. */

export type Tone = 'default' | 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'slate';

const toneText: Record<Tone, string> = {
  default: 'text-slate-900',
  green: 'text-emerald-600',
  red: 'text-rose-600',
  amber: 'text-amber-600',
  blue: 'text-sky-600',
  violet: 'text-violet-600',
  slate: 'text-slate-500',
};
const toneIcon: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  slate: 'bg-slate-100 text-slate-500',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  signedValue,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** لو اتبعتت، لون الرقم بيتحسب من إشارته: سالب أحمر، صفر أسود، موجب أخضر. */
  signedValue?: unknown;
  onClick?: () => void;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm ${onClick ? 'transition hover:border-slate-300 hover:shadow' : ''}`}
    >
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneIcon[tone]}`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span
          className={`mt-1 block text-2xl font-bold leading-tight ${
            signedValue === undefined ? toneText[tone] : signedTone(signedValue as number)
          }`}
        >
          {value}
        </span>
        {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      </span>
    </Comp>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const badgeTone: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  slate: 'bg-slate-100 text-slate-500',
};

export function Badge({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

export interface HealthFlag {
  level: 'danger' | 'warning' | 'info';
  code: string;
  message: string;
}

export function HealthFlags({
  flags,
  compact = false,
}: {
  flags?: HealthFlag[];
  compact?: boolean;
}) {
  if (!flags?.length) {
    return compact ? <Badge tone="green">سليم</Badge> : null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <Badge
          key={flag.code}
          tone={flag.level === 'danger' ? 'red' : flag.level === 'warning' ? 'amber' : 'blue'}
        >
          {flag.level === 'danger' ? (
            <ShieldAlert className="h-3 w-3" />
          ) : flag.level === 'warning' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Info className="h-3 w-3" />
          )}
          {flag.message}
        </Badge>
      ))}
    </div>
  );
}

export const tenantStatus = (t: {
  isActive: boolean;
  subscriptionStatus?: string;
  subscriptionEndDate?: string | null;
  daysLeft?: number | null;
}): { label: string; tone: Tone } => {
  if (!t.isActive) return { label: 'موقوف', tone: 'red' };
  if (t.subscriptionStatus === 'suspended') return { label: 'معلّق', tone: 'amber' };
  if (t.subscriptionStatus === 'cancelled') return { label: 'ملغي', tone: 'slate' };
  const days =
    t.daysLeft ??
    (t.subscriptionEndDate
      ? Math.ceil((new Date(t.subscriptionEndDate).getTime() - Date.now()) / 86_400_000)
      : null);
  if (t.subscriptionStatus === 'expired' || (days !== null && days < 0)) {
    return { label: 'منتهي', tone: 'red' };
  }
  if (days !== null && days <= 7) return { label: 'ينتهي قريب', tone: 'amber' };
  return { label: 'نشط', tone: 'green' };
};

export const daysLeftLabel = (days?: number | null) => {
  if (days === null || days === undefined) return 'بدون تاريخ انتهاء';
  if (days < 0) return `منتهي من ${-days} يوم`;
  if (days === 0) return 'ينتهي النهارده';
  return `باقي ${days} يوم`;
};

/** «من 3 أيام» وهكذا. */
export const timeAgo = (value?: string | null) => {
  if (!value) return 'أبداً';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'دلوقتي';
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `من ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `من ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `من ${months} شهر`;
  return `من ${Math.floor(months / 12)} سنة`;
};

export const fmtDate = (value?: string | null) => (value ? formatDate(value) : '—');
export const fmtDateTime = (value?: string | null) =>
  value ? formatDateTime(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const fmtNumber = (value: unknown, digits = 0) =>
  Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: digits });

export const fmtMoney = (value: unknown) =>
  `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

export const fmtBytes = (bytes: number) => {
  if (!bytes) return '0';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}

/** شريط تقدم صغير للاستخدام مقابل الحد. */
export function UsageBar({ used, limit }: { used: number; limit?: number | null }) {
  if (!limit) return <span className="text-xs text-slate-400">بدون حد</span>;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-400">
        {used} من {limit}
      </span>
    </div>
  );
}

export const selectClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
