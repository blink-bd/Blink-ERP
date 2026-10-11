import JsBarcode from 'jsbarcode';
import { escapeHtml } from './escape';

/**
 * يولّد باركود EAN-13 على شكل SVG حقيقي قابل للقراءة بجهاز Barcode Scanner
 * (مش خط أو رمز شكلي). يُستخدم لمعاينة الباركود ولطباعة الملصق.
 */
export function renderBarcodeSvg(
  value: string,
  options?: { width?: number; height?: number }
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, {
    format: value.length === 13 && /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128',
    width: options?.width ?? 2,
    height: options?.height ?? 50,
    displayValue: false,
    margin: 0,
  });
  return svg;
}

export interface BarcodeLabel {
  name: string;
  barcode: string;
  sellingPrice?: number;
  copies?: number;
}

/** ملصق واحد (من فورم المنتج أو زر الطباعة في الجدول). */
export function printBarcodeLabel(product: {
  name: string;
  barcode: string;
  sellingPrice?: number;
}) {
  printBarcodeLabels([{ ...product, copies: 1 }]);
}

/**
 * يفتح نافذة طباعة المتصفح بمقاس ملصق باركود حقيقي (50×30 مم) — ملصق لكل صفحة —
 * يحتوي على: اسم المنتج، صورة باركود فعلية (SVG)، رقم الباركود، والسعر (اختياري).
 * كل النصوص بتتهرّب قبل إدخالها في HTML لمنع حقن السكربتات (XSS) من أسماء المنتجات.
 */
export function printBarcodeLabels(
  labels: BarcodeLabel[],
  options?: { showPrice?: boolean; target?: Window | null }
) {
  // target: نافذة مفتوحة مسبقاً (قبل أي await) عشان المتصفح مايحجبهاش كـ popup
  const printWindow = options?.target ?? window.open('', '_blank', 'width=420,height=360');
  if (!printWindow) return false;

  const svgCache = new Map<string, string>();
  const parts: string[] = [];
  for (const label of labels) {
    let svg = svgCache.get(label.barcode);
    if (!svg) {
      try {
        svg = renderBarcodeSvg(label.barcode, { width: 2, height: 42 }).outerHTML;
      } catch {
        svg = '<div class="invalid">باركود غير صالح</div>';
      }
      svgCache.set(label.barcode, svg);
    }
    const copies = Math.max(1, Math.min(500, Math.floor(label.copies || 1)));
    const price =
      options?.showPrice && label.sellingPrice !== undefined
        ? `<div class="price">${escapeHtml(Number(label.sellingPrice).toFixed(2))}</div>`
        : '';
    const html = `<div class="label"><div class="name">${escapeHtml(label.name)}</div>${svg}<div class="code">${escapeHtml(label.barcode)}</div>${price}</div>`;
    for (let i = 0; i < copies; i++) parts.push(html);
  }

  const doc = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>ملصقات باركود (${parts.length})</title>
<style>
  @page { size: 50mm 30mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: 50mm; height: 30mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 1.5mm 1mm; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .label .name {
    font-size: 8px; font-weight: bold; text-align: center; max-width: 48mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.5mm;
  }
  .label svg { width: 44mm; height: 13mm; display: block; }
  .label .code { font-size: 9px; letter-spacing: 1px; margin-top: 0.5mm; direction: ltr; }
  .label .price { font-size: 10px; font-weight: bold; }
  .label .invalid { font-size: 9px; color: #b00; }
</style>
</head>
<body>
${parts.join('\n')}
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  printWindow.document.write(doc);
  printWindow.document.close();
  return true;
}
