import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * لون موحّد لكل الأرقام في شاشات التاجر ولوحة المدير العام:
 *   رقم بالسالب  → أحمر
 *   صفر          → أسود (لون النص العادي)
 *   فوق الصفر    → أخضر
 *
 * القيمة بتتحول لرقم الأول، فتنفع مع القيم الجاية من الـ API كنصوص («12.50»).
 * القيمة الفاضية أو غير الرقمية بتتعامل معاملة الصفر.
 */
export function signedTone(value: number | string | null | undefined): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed === 0) return 'text-gray-900';
  return parsed < 0 ? 'text-red-600' : 'text-emerald-600';
}

/**
 * غلاف لأي رقم معروض: بيحط اللون حسب الإشارة من غير ما يغيّر التنسيق الموجود.
 *   <Signed value={total}>{money(total)}</Signed>
 */
export function Signed({
  value,
  children,
  className,
}: {
  value: number | string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(signedTone(value), className)}>{children}</span>;
}
