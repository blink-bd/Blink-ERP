import { ForbiddenException } from '@nestjs/common';

/**
 * نطاق الوصول (الفروع/المخازن) للمستخدم الحالي — بيتحسب مع كل طلب في JwtStrategy
 * ويتحط في req.user.scope.
 *
 * المفاهيم:
 *  - allowed*: الفروع/المخازن المسموح للمستخدم يتعامل عليها أصلاً (null = كله، زي المالك).
 *  - active*: الفرع/المخزن اللي المستخدم اختار يشتغل عليه من صفحة «فرع العمل» (null = الكل).
 *  - branchIds / warehouseIds: الفلتر الفعلي اللي بيتطبق على البيانات بعد دمج الاتنين
 *    (null = من غير فلتر).
 *
 * كل مخزن تابع لفرع. المخزن اللي لسه مش مربوط بفرع (بيانات قديمة) بيُعتبر مشترك
 * وبيظهر مع أي فرع لحد ما يتربط.
 */
export interface AccessScope {
  isOwner: boolean;
  accessAll: boolean;
  allowedBranchIds: string[] | null;
  allowedWarehouseIds: string[] | null;
  activeBranchId: string | null;
  activeWarehouseId: string | null;
  branchIds: string[] | null;
  warehouseIds: string[] | null;
  /** الفرع الرئيسي للتاجر — افتراضي لتسجيل العمليات لما مفيش فرع محدد. */
  mainBranchId: string | null;
}

/** نطاق مفتوح (مفاتيح API، المهام الداخلية، الاختبارات). */
export const UNRESTRICTED_SCOPE: AccessScope = {
  isOwner: false,
  accessAll: true,
  allowedBranchIds: null,
  allowedWarehouseIds: null,
  activeBranchId: null,
  activeWarehouseId: null,
  branchIds: null,
  warehouseIds: null,
  mainBranchId: null,
};

export function scopeOf(req: any): AccessScope {
  return (req?.user?.scope as AccessScope) || UNRESTRICTED_SCOPE;
}

export function isWarehouseAllowed(scope: AccessScope, warehouseId: string): boolean {
  return !scope.allowedWarehouseIds || scope.allowedWarehouseIds.includes(warehouseId);
}

export function isWarehouseInWorkingScope(scope: AccessScope, warehouseId: string): boolean {
  return !scope.warehouseIds || scope.warehouseIds.includes(warehouseId);
}

export function isBranchAllowed(scope: AccessScope, branchId: string | null | undefined): boolean {
  if (!scope.allowedBranchIds) return true;
  return !!branchId && scope.allowedBranchIds.includes(branchId);
}

export function isBranchInWorkingScope(
  scope: AccessScope,
  branchId: string | null | undefined
): boolean {
  if (!scope.branchIds) return true;
  return !!branchId && scope.branchIds.includes(branchId);
}

/**
 * عمليات الكتابة (بيع/شراء/تعديل مخزون/تحويل/رصيد افتتاحي) بتتحقق من صلاحيات المستخدم
 * على المخزن مش من فرع العمل: فرع العمل فلتر عرض والواجهة بتختار مخزنه افتراضياً، وفرع
 * الفاتورة بيتحدد من فرع المخزن. كده اختيار قديم محفوظ على الجهاز مايوقفش البيع أبداً.
 */
export function assertWarehouseAllowed(scope: AccessScope, warehouseId: string): void {
  if (!isWarehouseAllowed(scope, warehouseId)) {
    throw new ForbiddenException('مش مسموح لك تتعامل على المخزن ده');
  }
}

/**
 * يبني شرط SQL للفلترة بقائمة IDs. بيرجّع '' لو مفيش فلتر.
 * بيضيف القيمة لمصفوفة params ويستخدم رقمها ($n).
 *
 * مثال: `WHERE tenant_id = $1 ${sqlIn('branch_id', scope.branchIds, params)}`
 */
export function sqlIn(column: string, ids: string[] | null, params: any[]): string {
  if (!ids) return '';
  params.push(ids);
  return ` AND ${column} = ANY($${params.length}::uuid[])`;
}

/** نسخة QueryBuilder: بيضيف andWhere لو فيه فلتر. */
export function qbIn(
  qb: { andWhere: (where: string, params?: Record<string, any>) => any },
  column: string,
  ids: string[] | null,
  paramName: string
): void {
  if (!ids) return;
  if (ids.length === 0) {
    qb.andWhere('1 = 0');
    return;
  }
  qb.andWhere(`${column} IN (:...${paramName})`, { [paramName]: ids });
}

/**
 * يقاطع قائمة فروع مطلوبة (من query مثلاً) مع نطاق المستخدم.
 * - مفيش طلب → فلتر النطاق (أو undefined = الكل).
 * - فيه طلب → المطلوب ∩ النطاق.
 */
export function intersectBranchFilter(
  scope: AccessScope,
  requested?: string[] | null
): string[] | undefined {
  const allowed = scope.branchIds;
  let result: string[] | undefined;
  if (!requested || !requested.length) result = allowed ?? undefined;
  else if (!allowed) result = requested;
  else result = requested.filter((id) => allowed.includes(id));
  // خدمات كتير بتعامل القائمة الفاضية كأنها «من غير فلتر» — فبنرجّع ID مستحيل بدلها.
  if (result && result.length === 0) return [NO_MATCH_ID];
  return result;
}

/** UUID مستحيل يطابق أي صف — بديل آمن للقائمة الفاضية في الفلاتر. */
export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

/**
 * الفرع اللي هتتسجل عليه عملية جديدة (بيع/شراء/مصروف/كاشير):
 * فرع المخزن ← فرع العمل الحالي ← الفرع الافتراضي للمستخدم ← الفرع الوحيد المسموح ← الرئيسي.
 */
export function resolveBranchForWrite(
  scope: AccessScope,
  warehouseBranchId?: string | null,
  defaultBranchId?: string | null
): string | null {
  if (warehouseBranchId && isBranchAllowed(scope, warehouseBranchId)) return warehouseBranchId;
  if (scope.activeBranchId) return scope.activeBranchId;
  if (defaultBranchId && isBranchAllowed(scope, defaultBranchId)) return defaultBranchId;
  if (scope.allowedBranchIds && scope.allowedBranchIds.length === 1) {
    return scope.allowedBranchIds[0];
  }
  if (scope.mainBranchId && isBranchAllowed(scope, scope.mainBranchId)) return scope.mainBranchId;
  if (scope.allowedBranchIds && scope.allowedBranchIds.length) return scope.allowedBranchIds[0];
  return scope.mainBranchId;
}

/** الجداول اللي فيها branch_id (وأحياناً warehouse_id) وبنتحقق منها قبل أي عملية على صف. */
const SCOPED_TABLES: Record<string, { warehouseColumn: string | null }> = {
  sales: { warehouseColumn: 'warehouse_id' },
  purchases: { warehouseColumn: 'warehouse_id' },
  sale_returns: { warehouseColumn: 'warehouse_id' },
  expenses: { warehouseColumn: null },
  maintenance_invoices: { warehouseColumn: null },
};

/**
 * يتأكد إن الصف (فاتورة بيع/شراء/مرتجع/مصروف...) تابع لفرع/مخزن مسموح للمستخدم.
 * بيستخدم الصلاحيات (مش فرع العمل) عشان فتح فاتورة قديمة من لينك مباشر يفضل شغال
 * طول ما المستخدم مسموح له بفرعها. لو الصف مش موجود بيسيب الخدمة ترجع 404.
 */
export async function assertRowAllowed(
  manager: { query: (sql: string, params?: any[]) => Promise<any[]> },
  table: keyof typeof SCOPED_TABLES,
  tenantId: string,
  id: string,
  scope: AccessScope
): Promise<void> {
  if (scope.accessAll) return;
  const { warehouseColumn } = SCOPED_TABLES[table];
  const [row] = await manager.query(
    `SELECT branch_id AS "branchId"${warehouseColumn ? `, ${warehouseColumn} AS "warehouseId"` : ''}
     FROM ${table} WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!row) return;
  const branchOk = isBranchAllowed(scope, row.branchId);
  const warehouseOk = !row.warehouseId || isWarehouseAllowed(scope, row.warehouseId);
  if (!branchOk || !warehouseOk) {
    throw new ForbiddenException('العملية دي تابعة لفرع أو مخزن مش مسموح لك');
  }
}
