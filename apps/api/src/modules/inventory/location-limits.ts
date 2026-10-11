import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { FeaturesService } from '@/modules/features/features.service';

/**
 * قواعد الفروع/المخازن المتعددة:
 * - بدون ميزة "branches" مسموح بفرع واحد فقط، وبدون "warehouses" مخزن واحد فقط.
 * - لو المدير العام حدد حد أقصى للتاجر (max_branches / max_warehouses) يتطبق كمان.
 */
export async function assertCanAddLocation(
  manager: EntityManager,
  features: FeaturesService,
  tenantId: string,
  kind: 'branches' | 'warehouses'
): Promise<void> {
  const [{ c }] = await manager.query(
    `SELECT COUNT(*)::int AS c FROM ${kind} WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const label = kind === 'branches' ? 'الفروع المتعددة' : 'المخازن المتعددة';
  if (c >= 1 && !(await features.tenantHasFeature(tenantId, kind))) {
    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      feature: kind,
      message: `إضافة أكثر من ${kind === 'branches' ? 'فرع' : 'مخزن'} تتطلب ميزة "${label}". تواصل مع الإدارة لتفعيلها`,
    });
  }
  const [tenant] = await manager.query(
    `SELECT max_branches AS "maxBranches", max_warehouses AS "maxWarehouses" FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const max = kind === 'branches' ? tenant?.maxBranches : tenant?.maxWarehouses;
  if (max && c >= max) {
    throw new ForbiddenException({
      code: 'LIMIT_REACHED',
      message: `وصلت للحد الأقصى (${max}) ${kind === 'branches' ? 'للفروع' : 'للمخازن'}. تواصل مع الإدارة لزيادته`,
    });
  }
}

/**
 * يتأكد إن المخزن مسموح استخدامه في عملية بيع/شراء: لو ميزة المخازن المتعددة
 * مقفولة، المسموح فقط المخزن الرئيسي (حتى لو فيه مخازن قديمة اتعملت قبل الإيقاف).
 */
export async function assertWarehouseUsable(
  manager: EntityManager,
  features: FeaturesService,
  tenantId: string,
  warehouseId: string
): Promise<void> {
  const [warehouse] = await manager.query(
    `SELECT id, is_main AS "isMain", is_active AS "isActive" FROM warehouses
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [warehouseId, tenantId]
  );
  if (!warehouse) throw new ForbiddenException('المخزن غير موجود في هذا التاجر');
  if (warehouse.isActive === false) throw new ForbiddenException('المخزن موقوف');
  if (!warehouse.isMain && !(await features.tenantHasFeature(tenantId, 'warehouses'))) {
    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      feature: 'warehouses',
      message: 'استخدام مخزن غير المخزن الرئيسي يتطلب ميزة "المخازن المتعددة"',
    });
  }
}
