import { useAuth } from '@/contexts/AuthContext';

/**
 * صلاحيات المستخدم الحالي في الواجهة (للعرض فقط — السيرفر هو اللي بيفرض الصلاحيات فعلياً).
 * has(a, b) = يملك واحدة على الأقل.
 */
export function usePermissions() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const isOwner = (user?.roles || []).includes('owner');
  return {
    isOwner,
    permissions: perms,
    has: (...required: string[]) => required.length === 0 || required.some((p) => perms.has(p)),
    hasAll: (...required: string[]) => required.every((p) => perms.has(p)),
  };
}
