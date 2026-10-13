import { useState, useEffect } from 'react';
import { defaultWorkingBranchId, keepIfValid, useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';
import { useFeature } from '@/contexts/FeaturesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/datetime';

export function CashRegisterPage() {
  const [shift, setShift] = useState<any>(null);
  const [registers, setRegisters] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [registerName, setRegisterName] = useState('الكاشير الرئيسي');
  const registersEnabled = useFeature('cash_register.registers');
  const [loading, setLoading] = useState(true);
  const [creatingRegister, setCreatingRegister] = useState(false);
  const [registerId, setRegisterId] = useState('');
  const [showAddRegister, setShowAddRegister] = useState(false);
  const { workspace } = useWorkspace();
  const workingBranchId = defaultWorkingBranchId(workspace);
  const branchName = (id?: string | null) =>
    (id && workspace?.branches.find((b) => b.id === id)?.name) || '';

  // الكاشير الافتراضي = كاشير تابع لفرع العمل الحالي، وإلا أول كاشير متاح.
  useEffect(() => {
    const active = registers.filter((r) => r.isActive !== false);
    const preferred = active.find((r) => workingBranchId && r.branchId === workingBranchId);
    setRegisterId((prev) =>
      keepIfValid(active, prev, (preferred || active[0])?.id || null)
    );
  }, [registers, workingBranchId]);

  const load = async () => {
    setLoading(true);
    try {
      const regRes = await api.get('/cash-register/registers');
      setRegisters(regRes.data.data);
      const shiftRes = await api.get('/cash-register/shifts/current');
      setShift(shiftRes.data.data);
      if (shiftRes.data.data) {
        const sumRes = await api.get(`/cash-register/shifts/${shiftRes.data.data.id}/summary`);
        setSummary(sumRes.data.data);
      } else {
        setSummary(null);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createRegister = async () => {
    setCreatingRegister(true);
    try {
      await api.post('/cash-register/registers', { name: registerName, branchId: workingBranchId || undefined });
      toast.success('تم إضافة الكاشير بنجاح');
      setShowAddRegister(false);
      load();
    } finally { setCreatingRegister(false); }
  };

  const openShift = async () => {
    if (!registerId) {
      toast.error('اختار الكاشير الأول');
      return;
    }
    await api.post('/cash-register/shifts', { cashRegisterId: registerId, openingBalance: Number(openingBalance) || 0 });
    toast.success('تم فتح الوردية بنجاح');
    setOpeningBalance('');
    load();
  };

  const closeShift = async () => {
    if (!shift) return;
    await api.post(`/cash-register/shifts/${shift.id}/close`, { actualCash: summary?.remaining.cash || 0, actualCard: summary?.remaining.card ?? summary?.sales.card ?? 0 });
    toast.success('تم إغلاق الوردية بنجاح');
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">الخزينة</h1>

      {loading ? (
        <p className="text-gray-400">جاري التحميل...</p>
      ) : registers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-4">
          {registersEnabled ? (
            <>
              <p className="text-sm text-gray-500">أضف أول كاشير عشان تقدر تفتح وردية:</p>
              <div><Label>اسم الكاشير</Label><Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} /></div>
              <Button onClick={createRegister} disabled={creatingRegister}>{creatingRegister ? 'جاري الإضافة...' : 'إضافة الكاشير'}</Button>
            </>
          ) : (
            <p className="text-sm text-gray-500">مفيش كاشير متسجل، وإضافة كاشير مقفولة لحسابك. تواصل مع إدارة النظام.</p>
          )}
        </div>
      ) : !shift ? (
        <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-4">
          {registers.filter((r) => r.isActive !== false).length > 1 && (
            <div>
              <Label>الكاشير</Label>
              <select
                className="border rounded-md h-10 px-3 w-full"
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
              >
                {registers
                  .filter((r) => r.isActive !== false)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {branchName(r.branchId) ? ` — ${branchName(r.branchId)}` : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div><Label>رصيد الافتتاح</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></div>
          <p className="text-xs text-gray-400">بيتسجل بالتاريخ والوقت الحاليين تلقائيًا.</p>
          <Button onClick={openShift}>فتح وردية جديدة</Button>
          {workspace?.features.branches && registersEnabled && (
            <div className="border-t pt-3">
              {showAddRegister ? (
                <div className="space-y-2">
                  <Label>اسم الكاشير الجديد{branchName(workingBranchId) ? ` (فرع ${branchName(workingBranchId)})` : ''}</Label>
                  <Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={createRegister} disabled={creatingRegister}>
                      {creatingRegister ? 'جاري الإضافة...' : 'إضافة'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddRegister(false)}>إلغاء</Button>
                  </div>
                </div>
              ) : (
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowAddRegister(true)}>
                  + إضافة كاشير لفرع العمل
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">وردية مفتوحة: {shift.shiftNumber}</p>
              <p className="text-sm text-gray-500">فُتحت في {formatDateTime(shift.openedAt)} — رصيد افتتاحي {Number(shift.openingBalance).toFixed(2)}</p>
            </div>
            <Button variant="destructive" onClick={closeShift}>إغلاق الوردية</Button>
          </div>

          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات نقدي</p><p className="text-xl font-bold">{summary.sales.cash.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات بطاقة</p><p className="text-xl font-bold">{summary.sales.card.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات تحويل</p><p className="text-xl font-bold">{summary.sales.bankTransfer.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات آجل</p><p className="text-xl font-bold text-orange-600">{summary.sales.credit.toFixed(2)}</p></div>
              {summary.collections && summary.collections.total > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">تحصيلات (فواتير سابقة / حساب العملاء)</p>
                  <p className="text-xl font-bold text-green-700">{summary.collections.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">نقدي {summary.collections.cash.toFixed(2)} · بطاقة {summary.collections.card.toFixed(2)} · تحويل {summary.collections.bankTransfer.toFixed(2)}</p>
                </div>
              )}
              {summary.returns && (
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">مرتجعات الوردية ({summary.returns.count})</p>
                  <p className="text-xl font-bold text-red-600">{summary.returns.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">
                    مردود نقدي {summary.returns.refunds.cash.toFixed(2)} · تحويل {summary.returns.refunds.bankTransfer.toFixed(2)} · بطاقة {summary.returns.refunds.card.toFixed(2)}
                    {summary.returns.invoiceCredit + summary.returns.accountCredit > 0 && ` · خصم من الآجل ${(summary.returns.invoiceCredit + summary.returns.accountCredit).toFixed(2)}`}
                  </p>
                </div>
              )}
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">المصروفات</p><p className="text-xl font-bold text-red-600">{summary.expenses.toFixed(2)}</p></div>
              {summary.sales.net !== undefined && (
                <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">صافي المبيعات بعد المرتجعات</p><p className="text-xl font-bold">{summary.sales.net.toFixed(2)}</p></div>
              )}
              <div className="bg-white rounded-lg shadow p-4 sm:col-span-2 bg-primary/5"><p className="text-sm text-gray-500">المتبقي نقدي بالخزينة</p><p className="text-2xl font-bold text-primary">{summary.remaining.cash.toFixed(2)}</p><p className="text-xs text-gray-500">الافتتاحي + المبيعات والتحصيلات النقدي + الإيداعات − المسحوبات − المصروفات − المردود النقدي</p></div>
              {summary.remaining.bankTransfer !== undefined && (
                <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">صافي التحويلات</p><p className="text-xl font-bold">{summary.remaining.bankTransfer.toFixed(2)}</p></div>
              )}
              {summary.remaining.card !== undefined && (
                <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">صافي البطاقة</p><p className="text-xl font-bold">{summary.remaining.card.toFixed(2)}</p></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
