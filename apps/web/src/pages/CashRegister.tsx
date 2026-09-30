import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

export function CashRegisterPage() {
  const [shift, setShift] = useState<any>(null);
  const [registers, setRegisters] = useState<any[]>([]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const regRes = await api.get('/cash-register/registers');
      setRegisters(regRes.data.data);
      try {
        const shiftRes = await api.get('/cash-register/shifts/current');
        setShift(shiftRes.data.data);
      } catch {
        setShift(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openShift = async () => {
    if (registers.length === 0) {
      toast.error('أضف كاشير أولاً');
      return;
    }
    await api.post('/cash-register/shifts', {
      cashRegisterId: registers[0].id,
      openingBalance: Number(openingBalance) || 0,
    });
    toast.success('تم فتح الوردية بنجاح');
    load();
  };

  const closeShift = async () => {
    if (!shift) return;
    await api.post(`/cash-register/shifts/${shift.id}/close`, { actualCash: 0, actualCard: 0 });
    toast.success('تم إغلاق الوردية بنجاح');
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">الخزينة</h1>
      {loading ? (
        <p className="text-gray-400">جاري التحميل...</p>
      ) : shift ? (
        <div className="bg-white rounded-lg shadow p-6 max-w-md">
          <p className="mb-2">وردية مفتوحة: <strong>{shift.shiftNumber}</strong></p>
          <p className="mb-4 text-sm text-gray-500">رصيد الافتتاح: {Number(shift.openingBalance).toFixed(2)}</p>
          <Button variant="destructive" onClick={closeShift}>إغلاق الوردية</Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-4">
          <div>
            <Label>رصيد الافتتاح</Label>
            <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
          </div>
          <Button onClick={openShift}>فتح وردية جديدة</Button>
        </div>
      )}
    </div>
  );
}
