import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/datetime';
import { callingCodeFor, toInternationalPhone } from '@/lib/phone';

export interface ShareSource {
  kind: 'sale' | 'purchase';
  id: string;
}

interface ShareInfo {
  kind: 'sale' | 'purchase';
  path: string;
  documentNumber: string;
  supplierInvoiceNumber?: string;
  date: string;
  currency: string;
  timezone: string;
  businessName: string;
  party: {
    type: 'customer' | 'supplier';
    name: string;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  totals: { total: number; paid: number; returned: number; remaining: number };
  items: Array<{ name: string; quantity: number }>;
}

const CURRENCY_LABELS: Record<string, string> = {
  EGP: 'ج.م',
  SAR: 'ر.س',
  AED: 'د.إ',
  KWD: 'د.ك',
  QAR: 'ر.ق',
  BHD: 'د.ب',
  OMR: 'ر.ع',
  JOD: 'د.أ',
  IQD: 'د.ع',
  LYD: 'د.ل',
};

const amount = (value: number, currency: string) =>
  `${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${CURRENCY_LABELS[currency] || currency}`;

const quantity = (value: number) =>
  Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });

/** الرسالة المختصرة اللي بتتبعت مع لينك الفاتورة. */
export function buildInvoiceMessage(info: ShareInfo, link: string): string {
  const isSale = info.kind === 'sale';
  const lines: string[] = [];
  lines.push(info.party ? `مرحباً ${info.party.name}،` : 'مرحباً،');
  lines.push(
    isSale
      ? `فاتورة رقم ${info.documentNumber} من ${info.businessName}`
      : `فاتورة مشتريات رقم ${info.documentNumber} من ${info.businessName}`
  );
  if (!isSale && info.supplierInvoiceNumber) {
    lines.push(`رقم فاتورتكم: ${info.supplierInvoiceNumber}`);
  }
  lines.push(`التاريخ: ${formatDate(info.date, {}, info.timezone)}`);
  const shown = info.items.slice(0, 3).map((item) => `${item.name} × ${quantity(item.quantity)}`);
  const more = info.items.length - shown.length;
  lines.push(
    `الأصناف (${info.items.length}): ${shown.join('، ')}${more > 0 ? ` و${more} أصناف أخرى` : ''}`
  );
  lines.push(`الإجمالي: ${amount(info.totals.total, info.currency)}`);
  lines.push(`المدفوع: ${amount(info.totals.paid, info.currency)}`);
  if (info.totals.returned > 0) {
    lines.push(`المرتجع: ${amount(info.totals.returned, info.currency)}`);
  }
  lines.push(
    info.totals.remaining > 0
      ? `المتبقي: ${amount(info.totals.remaining, info.currency)}`
      : 'الفاتورة مسددة بالكامل ✅'
  );
  lines.push('');
  lines.push('تفاصيل الفاتورة كاملة من اللينك ده:');
  lines.push(link);
  if (isSale) {
    lines.push('');
    lines.push('شكراً لتعاملك معنا 🌹');
  }
  return lines.join('\n');
}

/**
 * إرسال الفاتورة للعميل/المورد كلينك على الواتساب من رقم التاجر نفسه:
 * بيفتح واتساب (على الموبايل أو واتساب ويب) والرسالة جاهزة لرقم العميل/المورد المحفوظ.
 */
export function ShareInvoiceDialog({
  source,
  onClose,
}: {
  source: ShareSource | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const callingCode = useMemo(
    () => callingCodeFor(user?.tenant?.timezone, user?.tenant?.country),
    [user?.tenant?.timezone, user?.tenant?.country]
  );

  useEffect(() => {
    if (!source) {
      setInfo(null);
      return;
    }
    let active = true;
    setLoading(true);
    const request =
      source.kind === 'sale'
        ? api.get(`/sales/${source.id}/share`)
        : api.post(`/purchases/${source.id}/share`);
    request
      .then((response) => {
        if (!active) return;
        const data: ShareInfo = response.data.data;
        const link = `${window.location.origin}${data.path}`;
        setInfo(data);
        setPhone(data.party?.phone || '');
        setMessage(buildInvoiceMessage(data, link));
      })
      .catch(() => {
        if (active) onCloseRef.current();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source]);

  const link = info ? `${window.location.origin}${info.path}` : '';
  const whatsappNumber = toInternationalPhone(phone, callingCode);
  const partyLabel = source?.kind === 'purchase' ? 'المورد' : 'العميل';

  const openWhatsApp = () => {
    if (phone.trim() && !whatsappNumber) {
      toast.error('رقم الموبايل غير صحيح');
      return;
    }
    const url = whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('تم نسخ الرسالة');
    } catch {
      toast.error('تعذر النسخ');
    }
  };

  return (
    <Modal
      open={Boolean(source)}
      title={source?.kind === 'purchase' ? 'إرسال الفاتورة للمورد' : 'إرسال الفاتورة للعميل'}
      onClose={onClose}
      footer={
        info ? (
          <>
            <Button variant="outline" onClick={() => void copyMessage()}>
              <Copy className="ml-1 h-4 w-4" /> نسخ الرسالة
            </Button>
            <Button className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={openWhatsApp}>
              <MessageCircle className="ml-1 h-4 w-4" /> إرسال واتساب
            </Button>
          </>
        ) : undefined
      }
    >
      {loading || !info ? (
        <p className="py-8 text-center text-gray-400">جاري تجهيز الفاتورة…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="font-semibold">
              {info.party ? `${partyLabel}: ${info.party.name}` : `فاتورة من غير ${partyLabel}`}
            </div>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 break-all text-xs text-primary"
            >
              <ExternalLink className="h-3 w-3" /> معاينة اللينك اللي هيوصل
            </a>
          </div>

          <div>
            <Label>رقم موبايل {partyLabel} (واتساب)</Label>
            <Input
              dir="ltr"
              inputMode="tel"
              value={phone}
              placeholder="01xxxxxxxxx"
              onChange={(event) => setPhone(event.target.value)}
            />
            {!phone.trim() ? (
              <p className="mt-1 text-xs text-amber-700">
                مفيش رقم محفوظ لل{partyLabel === 'العميل' ? 'عميل' : 'مورد'} — اكتب الرقم هنا أو
                احفظه في بياناته، أو ابعت واتساب واختار جهة الاتصال بنفسك.
              </p>
            ) : whatsappNumber ? (
              <p className="mt-1 text-xs text-gray-500" dir="ltr">
                +{whatsappNumber}
              </p>
            ) : (
              <p className="mt-1 text-xs text-red-600">رقم الموبايل غير صحيح</p>
            )}
          </div>

          <div>
            <Label>الرسالة</Label>
            <textarea
              className="min-h-[220px] w-full rounded-md border p-3 text-sm leading-6"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              الرسالة بتتبعت من واتساب التاجر نفسه، وتقدر تعدّلها قبل الإرسال.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
