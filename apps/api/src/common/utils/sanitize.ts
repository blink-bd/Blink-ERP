/**
 * يمنع تمرير حقول حساسة من العميل (منع Mass Assignment) مثل tenantId و id.
 */
const PROTECTED_KEYS = [
  'id', 'tenantId', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'deletedAt',
  'passwordHash', 'balance',
];

export function stripProtected<T extends Record<string, any>>(data: T | undefined | null): Partial<T> {
  const copy: Record<string, any> = { ...(data || {}) };
  for (const key of PROTECTED_KEYS) delete copy[key];
  return copy as Partial<T>;
}
