import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/datetime';

// عارض الـ PDF (pdf.js) بيتحمّل بس لما حد يفتح ملف PDF على الموبايل.
const PdfPagesViewer = lazy(() => import('./PdfPagesViewer'));

interface InvoiceAttachmentItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface PreviewState {
  item: InvoiceAttachmentItem;
  blob: Blob;
  url: string;
}

const isImage = (mime: string) => mime.startsWith('image/');
const isPdf = (mime: string) => mime === 'application/pdf';

/** الموبايل/التابلت: متصفحاتهم مابتعرضش PDF جوه iframe، فبنرسمه بـ pdf.js. */
const prefersCanvasPdf = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768);

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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

  const fetchBlob = async (item: InvoiceAttachmentItem): Promise<Blob> => {
    const response = await api.get(`/invoice-attachments/files/${item.id}/content`, {
      responseType: 'blob',
    });
    const data: Blob = response.data;
    // نتأكد إن نوع الملف مضبوط عشان المتصفح يعرضه صح.
    return data.type === item.mimeType ? data : new Blob([data], { type: item.mimeType });
  };

  const download = async (item: InvoiceAttachmentItem) => {
    try {
      const blob = preview?.item.id === item.id ? preview.blob : await fetchBlob(item);
      saveBlob(blob, item.originalName);
    } catch {
      toast.error('تعذر تنزيل المرفق');
    }
  };

  const view = async (item: InvoiceAttachmentItem) => {
    setOpeningId(item.id);
    try {
      const blob = await fetchBlob(item);
      setPreview({ item, blob, url: URL.createObjectURL(blob) });
    } catch {
      toast.error('تعذر فتح المرفق');
    } finally {
      setOpeningId(null);
    }
  };

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  // تنظيف رابط المعاينة لو المكوّن اتقفل والمعاينة مفتوحة.
  const previewUrl = useRef<string | null>(null);
  previewUrl.current = preview?.url ?? null;
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    []
  );

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
              className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={item.originalName}>
                  {item.originalName}
                </div>
                <div className="text-xs text-gray-500">
                  {(item.sizeBytes / 1024 / 1024).toFixed(2)} م.ب ·{' '}
                  {formatDateTime(item.createdAt)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => view(item)}
                  disabled={openingId === item.id}
                  aria-label={`عرض المرفق ${item.originalName}`}
                >
                  <Eye className="ml-1 h-4 w-4" />
                  {openingId === item.id ? 'جاري الفتح...' : 'عرض'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => download(item)}
                  aria-label={`تنزيل المرفق ${item.originalName}`}
                >
                  <Download className="ml-1 h-4 w-4" /> تنزيل
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(item)}
                  aria-label={`حذف المرفق ${item.originalName}`}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!preview}
        title={preview?.item.originalName || 'عرض المرفق'}
        onClose={closePreview}
        wide
        footer={
          preview && (
            <>
              <Button type="button" variant="outline" onClick={() => download(preview.item)}>
                <Download className="ml-2 h-4 w-4" /> تنزيل
              </Button>
              <Button type="button" onClick={closePreview}>
                إغلاق
              </Button>
            </>
          )
        }
      >
        {preview && isImage(preview.item.mimeType) && (
          <img
            src={preview.url}
            alt={preview.item.originalName}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded object-contain"
          />
        )}
        {preview &&
          isPdf(preview.item.mimeType) &&
          (prefersCanvasPdf() ? (
            <Suspense
              fallback={<p className="py-6 text-center text-sm text-gray-500">جاري عرض الملف...</p>}
            >
              <PdfPagesViewer data={preview.blob} />
            </Suspense>
          ) : (
            <iframe
              src={preview.url}
              title={preview.item.originalName}
              className="h-[70vh] w-full rounded border"
            />
          ))}
        {preview && !isImage(preview.item.mimeType) && !isPdf(preview.item.mimeType) && (
          <p className="py-6 text-center text-sm text-gray-500">
            نوع الملف ده مايتعرضش هنا. تقدر تنزّله وتفتحه من الجهاز.
          </p>
        )}
      </Modal>
    </div>
  );
}
