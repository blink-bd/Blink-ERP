import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useFeature } from '@/contexts/FeaturesContext';
import { usePermissions } from '@/lib/permissions';
import { downloadFromApi } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { FeatureLocked } from '@/components/ui/feature-locked';

interface EntityColumn {
  key: string;
  label: string;
  required: boolean;
  exportOnly: boolean;
  createOnly: boolean;
}
interface EntityDef {
  entity: string;
  labelAr: string;
  matchBy: string | string[];
  columns: EntityColumn[];
}
interface ImportResult {
  dryRun: boolean;
  applied: boolean;
  summary: {
    totalRows: number;
    valid: number;
    toCreate: number;
    toUpdate: number;
    created: number;
    updated: number;
    failed: number;
  };
  errors: { row: number; field?: string; message: string }[];
}

const MATCH_LABEL: Record<string, string> = {
  sku: 'كود المنتج (SKU)',
  barcode: 'الباركود',
  phone: 'رقم الموبايل',
  email: 'البريد',
  name: 'الاسم',
};
const matchLabel = (m: string | string[]) =>
  (Array.isArray(m) ? m : [m]).map((k) => MATCH_LABEL[k] || k).join(' أو ');

export function DataTransferPage() {
  const enabled = useFeature('import_export');
  const { has } = usePermissions();
  const canImport = has('data.import');
  const canExport = has('data.export');
  const [entities, setEntities] = useState<EntityDef[]>([]);
  const [selected, setSelected] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled || !(canImport || canExport)) return;
    api
      .get('/data/entities')
      .then((r) => {
        setEntities(r.data.data);
        if (r.data.data[0]) setSelected(r.data.data[0].entity);
      })
      .catch(() => {});
  }, [enabled]);

  if (!enabled) return <FeatureLocked title="الاستيراد والتصدير" />;
  if (!canImport && !canExport)
    return (
      <FeatureLocked
        title="الاستيراد والتصدير"
        message="ليس لديك صلاحية استيراد أو تصدير البيانات."
      />
    );

  const def = entities.find((e) => e.entity === selected);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const download = async (kind: 'template' | 'export') => {
    if (!def) return;
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFromApi(
        `/data/${kind}/${def.entity}`,
        kind === 'template' ? `${def.entity}-template.csv` : `${def.entity}-${date}.csv`
      );
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!def || !file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api.post(`/data/import/${def.entity}`, body, {
        params: { dryRun: dryRun ? 'true' : 'false' },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data: ImportResult = res.data.data;
      setResult(data);
      if (data.applied)
        toast.success(`تم الاستيراد: ${data.summary.created} جديد و ${data.summary.updated} تحديث`);
      else if (!data.errors.length) toast.success('الملف سليم — راجع الملخص واضغط تطبيق');
    } catch {
      /* interceptor */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">استيراد وتصدير البيانات</h1>
        <p className="text-sm text-gray-500">
          انقل منتجاتك وعملاءك ومورديك من/إلى Excel بصيغة CSV (UTF-8).
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {entities.map((e) => (
          <button
            key={e.entity}
            onClick={() => {
              setSelected(e.entity);
              reset();
            }}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${selected === e.entity ? 'bg-primary text-white' : 'border bg-white'}`}
          >
            <FileSpreadsheet className="h-4 w-4" /> {e.labelAr}
          </button>
        ))}
      </div>

      {def && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-white p-5 shadow">
            <h2 className="mb-3 font-semibold">1. نزّل الملف</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              {canImport && (
                <Button variant="outline" disabled={busy} onClick={() => download('template')}>
                  <Download className="me-2 h-4 w-4" /> قالب فاضي
                </Button>
              )}
              {canExport && (
                <Button variant="outline" disabled={busy} onClick={() => download('export')}>
                  <Download className="me-2 h-4 w-4" /> تصدير البيانات الحالية
                </Button>
              )}
            </div>
            <p className="mb-2 text-sm text-gray-600">
              المطابقة بـ <b>{matchLabel(def.matchBy)}</b>: لو موجود هيتحدث، لو مش موجود هيتضاف
              جديد.
            </p>
            <div className="flex flex-wrap gap-1">
              {def.columns
                .filter((c) => !c.exportOnly)
                .map((c) => (
                  <span
                    key={c.key}
                    className={`rounded px-2 py-0.5 text-xs ${c.required ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                    title={c.createOnly ? 'يُستخدم عند الإنشاء فقط' : undefined}
                  >
                    {c.label}
                    {c.required && ' *'}
                    {c.createOnly && ' (جديد فقط)'}
                  </span>
                ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              * حقل مطلوب. من Excel: ملف ← حفظ باسم ← CSV UTF-8. الحد الأقصى 5 ميجا.
            </p>
          </div>

          {canImport && (
            <div className="rounded-lg bg-white p-5 shadow">
              <h2 className="mb-3 font-semibold">2. ارفع الملف وراجعه</h2>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="mb-4 block w-full text-sm file:me-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!file || busy} onClick={() => runImport(true)}>
                  <Upload className="me-2 h-4 w-4" /> فحص الملف (بدون حفظ)
                </Button>
                <Button
                  disabled={
                    !file ||
                    busy ||
                    !result ||
                    result.applied ||
                    result.errors.length > 0 ||
                    result.summary.valid === 0
                  }
                  onClick={() => runImport(false)}
                >
                  <CheckCircle2 className="me-2 h-4 w-4" /> تطبيق الاستيراد
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                لازم تفحص الملف الأول. لو فيه أي خطأ مش هيتحفظ أي سطر.
              </p>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 font-semibold">
            {result.applied ? 'نتيجة الاستيراد' : 'نتيجة الفحص'}
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="إجمالي السطور" value={result.summary.totalRows} />
            <Stat label="سليم" value={result.summary.valid} tone="green" />
            <Stat
              label={result.applied ? 'تمت إضافته' : 'هيتضاف'}
              value={result.applied ? result.summary.created : result.summary.toCreate}
              tone="blue"
            />
            <Stat
              label={result.applied ? 'تم تحديثه' : 'هيتحدث'}
              value={result.applied ? result.summary.updated : result.summary.toUpdate}
              tone="amber"
            />
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="mb-2 flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" /> {result.errors.length} خطأ — صلّحهم في الملف
                وارفعه تاني
              </div>
              <div className="max-h-80 overflow-y-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="p-2 text-right">السطر</th>
                      <th className="p-2 text-right">الحقل</th>
                      <th className="p-2 text-right">الخطأ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{e.row}</td>
                        <td className="p-2">{e.field || '—'}</td>
                        <td className="p-2 text-red-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: number;
  tone?: 'gray' | 'green' | 'blue' | 'amber';
}) {
  const tones = {
    gray: 'bg-gray-50 text-gray-800',
    green: 'bg-green-50 text-green-800',
    blue: 'bg-blue-50 text-blue-800',
    amber: 'bg-amber-50 text-amber-800',
  };
  return (
    <div className={`rounded-lg p-3 ${tones[tone]}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
