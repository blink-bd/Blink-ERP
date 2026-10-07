import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

export function CashRegisterPage() {
  const [shift, setShift] = useState<any>(null);
  const [registers, setRegisters] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [registerName, setRegisterName] = useState('الكاشير الرئيسي');
  const [loading, setLoading] = useState(true);
  const [creatingRegister, setCreatingRegister] = useState(false);

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
      await api.post('/cash-register/registers', { name: registerName });
      toast.success('تم إضافة الكاشير بنجاح');
      load();
    } finally { setCreatingRegister(false); }
  };

  const openShift = async () => {
    await api.post('/cash-register/shifts', { cashRegisterId: registers[0].id, openingBalance: Number(openingBalance) || 0 });
    toast.success('تم فتح الوردية بنجاح');
    setOpeningBalance('');
    load();
  };

  const closeShift = async () => {
    if (!shift) return;
    await api.post(`/cash-register/shifts/${shift.id}/close`, { actualCash: summary?.remaining.cash || 0, actualCard: summary?.sales.card || 0 });
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
          <p className="text-sm text-gray-500">أضف أول كاشير عشان تقدر تفتح وردية:</p>
          <div><Label>اسم الكاشير</Label><Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} /></div>
          <Button onClick={createRegister} disabled={creatingRegister}>{creatingRegister ? 'جاري الإضافة...' : 'إضافة الكاشير'}</Button>
        </div>
      ) : !shift ? (
        <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-4">
          <div><Label>رصيد الافتتاح</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></div>
          <p className="text-xs text-gray-400">بيتسجل بالتاريخ والوقت الحاليين تلقائيًا.</p>
          <Button onClick={openShift}>فتح وردية جديدة</Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">وردية مفتوحة: {shift.shiftNumber}</p>
              <p className="text-sm text-gray-500">فُتحت في {new Date(shift.openedAt).toLocaleString('ar')} — رصيد افتتاحي {Number(shift.openingBalance).toFixed(2)}</p>
            </div>
            <Button variant="destructive" onClick={closeShift}>إغلاق الوردية</Button>
          </div>

          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات نقدي</p><p className="text-xl font-bold">{summary.sales.cash.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات بطاقة</p><p className="text-xl font-bold">{summary.sales.card.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات تحويل</p><p className="text-xl font-bold">{summary.sales.bankTransfer.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">مبيعات آجل</p><p className="text-xl font-bold text-orange-600">{summary.sales.credit.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">المصروفات</p><p className="text-xl font-bold text-red-600">{summary.expenses.toFixed(2)}</p></div>
              <div className="bg-white rounded-lg shadow p-4 sm:col-span-2 bg-primary/5"><p className="text-sm text-gray-500">المتبقي نقدي بالخزينة</p><p className="text-2xl font-bold text-primary">{summary.remaining.cash.toFixed(2)}</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
