/**
 * أدوات CSV خفيفة بدون مكتبات خارجية (RFC 4180):
 * - parseCsv: يدعم الحقول بين علامات تنصيص، والفواصل/الأسطر الجديدة داخلها،
 *   والفاصل المنقوط ";" (إعداد Excel العربي في بعض الأجهزة)، و BOM.
 * - toCsv: يضيف BOM عشان Excel يفتح العربي صح، ويحمي من "CSV Injection"
 *   (خلايا تبدأ بـ = + - @ ممكن Excel ينفذها كمعادلات خبيثة).
 */

export const MAX_IMPORT_ROWS = 5000;

export function parseCsv(input: string): string[][] {
  let text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter =
    countOutsideQuotes(firstLine, ';') > countOutsideQuotes(firstLine, ',') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_IMPORT_ROWS + 1) break; // + header
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  text = '';
  // تجاهل الأسطر الفاضية تماماً
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === ch && !q) n++;
  }
  return n;
}

/** يمنع تنفيذ معادلات عند فتح الملف في Excel/Sheets. */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(sanitizeCell).join(',')];
  for (const r of rows) lines.push(r.map(sanitizeCell).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
