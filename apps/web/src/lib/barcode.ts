import JsBarcode from 'jsbarcode';

/**
 * يولّد باركود EAN-13 على شكل SVG حقيقي قابل للقراءة بجهاز Barcode Scanner
 * (مش خط أو رمز شكلي). يُستخدم لمعاينة الباركود ولطباعة الملصق.
 */
export function renderBarcodeSvg(value: string, options?: { width?: number; height?: number }): SVGSVGElement {
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

/**
 * يفتح نافذة طباعة المتصفح بمقاس ملصق باركود حقيقي (50×30 مم) يحتوي على:
 * اسم المنتج، صورة باركود فعلية (SVG)، ورقم الباركود كنص.
 * مناسبة للطباعة على طابعات الملصقات المثبّتة على نظام التشغيل عبر
 * نافذة طباعة المتصفح العادية (window.print) باستخدام مقاس ورق @page صحيح.
 */
export function printBarcodeLabel(product: { name: string; barcode: string }) {
  const svg = renderBarcodeSvg(product.barcode, { width: 2, height: 42 });
  const svgMarkup = svg.outerHTML;

  const printWindow = window.open('', '_blank', 'width=400,height=300');
  if (!printWindow) return;

  const safeName = product.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>ملصق باركود - ${safeName}</title>
<style>
  @page { size: 50mm 30mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    width: 50mm; height: 30mm;
    font-family: Arial, Helvetica, sans-serif;
  }
  .label {
    width: 50mm; height: 30mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 1.5mm 1mm;
    overflow: hidden;
  }
  .label .name {
    font-size: 8px; font-weight: bold;
    text-align: center;
    max-width: 48mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 0.5mm;
  }
  .label svg { width: 44mm; height: 14mm; display: block; }
  .label .code { font-size: 9px; letter-spacing: 1px; margin-top: 0.5mm; direction: ltr; }
</style>
</head>
<body>
  <div class="label">
    <div class="name">${safeName}</div>
    ${svgMarkup}
    <div class="code">${product.barcode}</div>
  </div>
  <script>
    window.onload = function () { window.print(); };
  </script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
