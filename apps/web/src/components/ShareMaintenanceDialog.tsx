import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { callingCodeFor, toInternationalPhone } from '@/lib/phone';

interface MaintenanceShareInfo {
  invoiceNumber: string;
  currency: string;
  timezone: string;
  businessName: string;
  customer: { name: string; phone: string | null; whatsapp: string | null };
  /** إيراد خدمة الصيانة — هو بس اللي بيظهر للعميل بمسمى «تكلفة الصيانة». */
  servicePrice: number;
  message: string;
}

/**
 * إرسال فاتورة الصيانة للعميل على الواتساب.
 *
 * الرسالة بتيجي جاهزة من السيرفر وفيها تفاصيل الشغل و«تكلفة الصيانة» اللي العميل دفعها بس —
 * تكلفة القطع والربح مش بتوصل هنا أصلاً، فمستحيل تتسرب في الرسالة.
 */
export function ShareMaintenanceDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [info, setInfo] = useState<MaintenanceShareInfo | null>(null);
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
    if (!invoiceId) {
      setInfo(null);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get(`/maintenance/${invoiceId}/share`)
      .then((response) => {
        if (!active) return;
        const data: MaintenanceShareInfo = response.data.data;
        setInfo(data);
        setPhone(data.customer.phone || '');
        setMessage(data.message);
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
  }, [invoiceId]);

  const whatsappNumber = toInternationalPhone(phone, callingCode);

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
      open={Boolean(invoiceId)}
      title="إرسال فاتورة الصيانة للعميل"
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
            <div className="font-semibold">العميل: {info.customer.name}</div>
            <div className="mt-1 text-xs text-gray-500">
              فاتورة {info.invoiceNumber} · تكلفة الصيانة:{' '}
              {Number(info.servicePrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
              {info.currency}
            </div>
          </div>

          <div>
            <Label>رقم موبايل العميل (واتساب)</Label>
            <Input
              dir="ltr"
              inputMode="tel"
              value={phone}
              placeholder="01xxxxxxxxx"
              onChange={(event) => setPhone(event.target.value)}
            />
            {!phone.trim() ? (
              <p className="mt-1 text-xs text-amber-700">
                مفيش رقم محفوظ للعميل — اكتب الرقم هنا، أو ابعت واتساب واختار جهة الاتصال بنفسك.
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
              الرسالة فيها تفاصيل الصيانة و«تكلفة الصيانة» اللي العميل دفعها فقط — تكلفة القطع
              والربح مش بتتبعت. تقدر تعدّلها قبل الإرسال.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
