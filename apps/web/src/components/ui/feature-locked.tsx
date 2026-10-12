import { Lock } from 'lucide-react';

/** رسالة موحدة لما الميزة مش مفعلة أو المستخدم ماعندوش صلاحية. */
export function FeatureLocked({ title, message }: { title: string; message?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-white p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="text-sm text-gray-500">
        {message || 'الميزة دي مش مفعّلة لحسابك. تواصل مع إدارة النظام لتفعيلها.'}
      </p>
    </div>
  );
}
