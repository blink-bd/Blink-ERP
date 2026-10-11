import { ForbiddenException } from '@nestjs/common';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any[]> };

/** عدد المنتجات الحالي والحد الأقصى للتاجر (null = بدون حد). */
export async function getProductCapacity(db: Queryable, tenantId: string) {
  const [row] = await db.query(
    `SELECT t.max_products AS "maxProducts",
            (SELECT COUNT(*)::int FROM products p WHERE p.tenant_id = t.id AND p.deleted_at IS NULL) AS "count"
     FROM tenants t WHERE t.id = $1`,
    [tenantId]
  );
  const max: number | null = row?.maxProducts ?? null;
  const count: number = row?.count ?? 0;
  return { max, count, remaining: max === null ? Infinity : Math.max(0, max - count) };
}

/**
 * يمنع تجاوز الحد الأقصى للمنتجات اللي حدده المدير العام للتاجر.
 * @param adding عدد المنتجات الجديدة المطلوب إضافتها (للاستيراد بالجملة).
 */
export async function assertCanAddProducts(db: Queryable, tenantId: string, adding = 1) {
  if (adding <= 0) return;
  const { max, count } = await getProductCapacity(db, tenantId);
  if (max !== null && count + adding > max) {
    throw new ForbiddenException({
      code: 'LIMIT_REACHED',
      limit: 'maxProducts',
      message:
        adding === 1
          ? `وصلت للحد الأقصى للمنتجات في باقتك (${max}). تواصل مع الإدارة لزيادته`
          : `الاستيراد هيضيف ${adding} منتج جديد والمتاح ${Math.max(0, max - count)} بس من حد باقتك (${max})`,
    });
  }
}
