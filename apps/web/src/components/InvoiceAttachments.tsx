import { useEffect, useRef, useState } from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

interface InvoiceAttachmentItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function InvoiceAttachments({
  entityType,
  invoiceId,
}: {
  entityType: 'sales' | 'purchases';
  invoiceId: string;
}) {
  const [items, setItems] = useState<InvoiceAttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/invoice-attachments/invoices/${entityType}/${invoiceId}`);
      setItems(response.data.data);
    } catch {
      toast.error('تعذر تحميل مرفقات الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Invoice identity is stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, invoiceId]);

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('الحد الأقصى لحجم الملف 5 ميجابايت');
      return;
    }
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      await api.post(`/invoice-attachments/invoices/${entityType}/${invoiceId}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('تم حفظ المرفق مع الفاتورة');
      await load();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const download = async (item: InvoiceAttachmentItem) => {
    try {
      const response = await api.get(`/invoice-attachments/files/${item.id}/content`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.originalName;
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error('تعذر فتح المرفق');
    }
  };

  const remove = async (item: InvoiceAttachmentItem) => {
    if (!window.confirm(`حذف المرفق «${item.originalName}»؟`)) return;
    try {
      await api.delete(`/invoice-attachments/files/${item.id}`);
      setItems((current) => current.filter((attachment) => attachment.id !== item.id));
      toast.success('تم حذف المرفق');
    } catch {
      toast.error('تعذر حذف المرفق');
    }
  };

  return (
    <div className="rounded-md border bg-gray-50 p-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" /> إثباتات الدفع والمرفقات
        </div>
        <>
          <input
            ref={fileInput}
            className="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) =>
              upload(event.target.files?.[0]).catch(() => toast.error('تعذر رفع الملف'))
            }
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="ml-2 h-4 w-4" /> {uploading ? 'جارٍ الرفع...' : 'إرفاق ملف'}
          </Button>
        </>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        JPG أو PNG أو WebP أو PDF، بحد أقصى 5 ميجابايت للملف.
      </p>
      {loading ? (
        <div className="mt-3 text-xs text-gray-500">جاري تحميل المرفقات...</div>
      ) : items.length === 0 ? (
        <div className="mt-3 text-xs text-gray-500">لا توجد مرفقات لهذه الفاتورة.</div>
      ) : (
        <ul className="mt-3 divide-y rounded border bg-white">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 p-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.originalName}</div>
                <div className="text-xs text-gray-500">
                  {(item.sizeBytes / 1024 / 1024).toFixed(2)} م.ب ·{' '}
                  {new Date(item.createdAt).toLocaleString('ar-EG')}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => download(item)}
                  aria-label="فتح المرفق"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(item)}
                  aria-label="حذف المرفق"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
