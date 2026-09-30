import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Expense {
  id: string;
  expenseNumber: string;
  amount: number;
  description: string;
  expenseDate: string;
}

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/expenses')
      .then((res) => setExpenses(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">المصروفات</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right p-3">الرقم</th>
              <th className="text-right p-3">الوصف</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>
            )}
            {!loading && expenses.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد مصروفات مسجلة بعد</td></tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.expenseNumber}</td>
                <td className="p-3">{e.description}</td>
                <td className="p-3 text-gray-500">{new Date(e.expenseDate).toLocaleDateString('ar')}</td>
                <td className="p-3 font-medium">{Number(e.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
