import { useEffect, useRef, useState } from 'react';
// النسخة legacy بتشتغل على الموبايلات والمتصفحات القديمة كمان.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** أقصى عدد صفحات بيترسم في المعاينة (الملف كامل متاح بالتنزيل). */
const MAX_PAGES = 30;

/**
 * عرض ملف PDF صفحة صفحة جوه الصفحة نفسها (canvas). بيستخدم على الموبايل لأن
 * متصفحات الموبايل (خصوصاً كروم على أندرويد) مابتعرضش PDF جوه iframe وبتنزّله.
 */
export default function PdfPagesViewer({ data }: { data: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageInfo, setPageInfo] = useState<{ shown: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | null = null;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    setStatus('loading');

    (async () => {
      try {
        const bytes = new Uint8Array(await data.arrayBuffer());
        doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
        if (cancelled) return;
        const total = doc.numPages;
        const shown = Math.min(total, MAX_PAGES);
        setPageInfo({ shown, total });
        const width = Math.max(container.clientWidth, 240);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNumber = 1; pageNumber <= shown; pageNumber++) {
          const page = await doc.getPage(pageNumber);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'mb-3 rounded border bg-white shadow-sm';
          canvas.setAttribute('aria-label', `صفحة ${pageNumber}`);
          container.appendChild(canvas);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('canvas');
          await page.render({ canvasContext: context, viewport }).promise;
          if (pageNumber === 1 && !cancelled) setStatus('ready');
        }
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [data]);

  return (
    <div>
      {status === 'loading' && (
        <p className="py-6 text-center text-sm text-gray-500">جاري عرض الملف...</p>
      )}
      {status === 'error' && (
        <p className="py-6 text-center text-sm text-red-600">
          تعذّر عرض ملف الـ PDF هنا. تقدر تنزّله وتفتحه من الجهاز.
        </p>
      )}
      <div ref={containerRef} />
      {pageInfo && pageInfo.total > pageInfo.shown && (
        <p className="text-center text-xs text-gray-500">
          معروض أول {pageInfo.shown} صفحة من {pageInfo.total}. نزّل الملف عشان تشوفه كامل.
        </p>
      )}
    </div>
  );
}
