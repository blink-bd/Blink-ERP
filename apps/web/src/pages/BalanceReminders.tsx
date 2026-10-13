import { useCallback, useEffect, useState } from 'react';
import { BellRing, Clock3, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/datetime';

interface ReminderEvent {
  id: string;
  partyType: 'customer' | 'supplier';
  partyName: string;
  balance: number;
  reminderDays: number;
  dueAt: string;
  notifiedAt: string;
  emailStatus: 'sent' | 'skipped' | 'failed';
  whatsappStatus: 'sent' | 'skipped' | 'failed';
}

interface ReminderResponse {
  events: ReminderEvent[];
  config: { customerReminderDays: number; supplierReminderDays: number };
  supplierLimit: {
    enabled: boolean;
    configured: boolean;
    limitAmount: number;
    totalPayables: number;
    overLimit: boolean;
    isAlertActive: boolean;
    emailStatus: 'sent' | 'skipped' | 'failed';
    whatsappStatus: 'sent' | 'skipped' | 'failed';
    lastNotifiedAt?: string | null;
  };
}

const deliveryLabel: Record<ReminderEvent['emailStatus'], string> = {
  sent: 'تم الإرسال',
  skipped: 'غير مهيأ',
  failed: 'فشل الإرسال',
};

export function BalanceRemindersPage() {
  const [data, setData] = useState<ReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/balance-reminders');
      setData(response.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => toast.error('تعذر تحميل تنبيهات الأرصدة'));
  }, [load]);

  const snooze = async (event: ReminderEvent) => {
    setSnoozingId(event.id);
    try {
      const response = await api.post(`/balance-reminders/${event.id}/snooze`);
      if (response.data.data?.resolved) {
        toast.success('تم إغلاق التنبيه لأن رصيد العميل أصبح صفراً');
      } else {
        toast.success('تم تأجيل التنبيه وإعادة بدء العد وفق المدة الحالية');
      }
      await load();
    } catch {
      toast.error('تعذر تأجيل التنبيه');
    } finally {
      setSnoozingId(null);
    }
  };

  const events = data?.events || [];

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">تنبيهات الأرصدة</h1>
          <p className="mt-1 text-sm text-gray-500">
            تذكيرات دورية بالأرصدة غير المسددة، وفق المدد التي حددها المدير العام.
          </p>
        </div>
        <Button variant="outline" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </Button>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-4">
            <div className="text-sm text-gray-500">تكرار تنبيه العملاء</div>
            <div className="mt-1 text-xl font-semibold">
              كل {data.config.customerReminderDays} يوماً
            </div>
            <div className="mt-1 text-xs text-gray-500">
              يمكن تأجيل كل تنبيه عميل لإعادة بدء العد.
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-sm text-gray-500">تكرار تنبيه الموردين</div>
            <div className="mt-1 text-xl font-semibold">
              كل {data.config.supplierReminderDays} يوماً
            </div>
            <div className="mt-1 text-xs text-gray-500">
              تُعاد جدولة تنبيه المورد بعد تغيير رصيده بالسداد.
            </div>
          </div>
        </div>
      )}

      {data?.supplierLimit.enabled && (
        <section
          className={`rounded-lg border p-4 ${data.supplierLimit.overLimit ? 'border-red-300 bg-red-50' : 'bg-white'}`}
        >
          <h2 className="font-semibold">حد إجمالي المبالغ المستحقة للموردين</h2>
          {!data.supplierLimit.configured ? (
            <p className="mt-2 text-sm text-gray-600">لم يحدد المدير العام مبلغ الحد بعد.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                الإجمالي الحالي:{' '}
                <strong>
                  {Number(data.supplierLimit.totalPayables).toLocaleString('ar-EG', {
                    minimumFractionDigits: 2,
                  })}{' '}
                  ج.م
                </strong>
              </span>
              <span>
                الحد:{' '}
                <strong>
                  {Number(data.supplierLimit.limitAmount).toLocaleString('ar-EG', {
                    minimumFractionDigits: 2,
                  })}{' '}
                  ج.م
                </strong>
              </span>
              {data.supplierLimit.overLimit ? (
                <span className="font-semibold text-red-700">
                  تم تجاوز الحد — أُرسل تنبيه{' '}
                  {data.supplierLimit.lastNotifiedAt
                    ? `في ${formatDateTime(data.supplierLimit.lastNotifiedAt)}`
                    : ''}
                </span>
              ) : (
                <span className="text-green-700">الإجمالي داخل الحد المسموح.</span>
              )}
              <span className="text-xs text-gray-600">
                البريد: {deliveryLabel[data.supplierLimit.emailStatus]} · واتساب:{' '}
                {deliveryLabel[data.supplierLimit.whatsappStatus]}
              </span>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
          <BellRing className="h-5 w-5 text-primary" /> التنبيهات النشطة
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{events.length}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري تحميل التنبيهات...</div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center text-gray-500">لا توجد تنبيهات نشطة حالياً.</div>
        ) : (
          <div className="divide-y">
            {events.map((event) => (
              <article
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                      {event.partyType === 'customer' ? 'عميل' : 'مورد'}
                    </span>
                    <h2 className="font-semibold">{event.partyName}</h2>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>
                      الرصيد:{' '}
                      {Number(event.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}{' '}
                      ج.م
                    </span>
                    <span>الفاصل: {event.reminderDays} يوماً</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> آخر تنبيه:{' '}
                      {formatDateTime(event.notifiedAt)}
                    </span>
                    <span>البريد: {deliveryLabel[event.emailStatus]}</span>
                    <span>واتساب: {deliveryLabel[event.whatsappStatus]}</span>
                  </div>
                </div>
                {event.partyType === 'customer' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={snoozingId === event.id}
                    onClick={() => snooze(event)}
                  >
                    {snoozingId === event.id
                      ? 'جارٍ التأجيل...'
                      : `غفوة ${event.reminderDays} يوماً`}
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
