import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  AccessScope,
  warehouseBranchIds,
  warehouseServesBranch,
} from '@/common/utils/access-scope';
import { Branch } from '@/modules/inventory/entities/branch.entity';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { User } from './entities/user.entity';

export type ScopeUser = Pick<
  User,
  | 'tenantId'
  | 'accessAllBranches'
  | 'allowedBranchIds'
  | 'allowedWarehouseIds'
  | 'activeBranchId'
  | 'activeWarehouseId'
> & { roles?: { name: string }[] };

export const OWNER_ROLE_NAME = 'owner';

export function userIsOwner(user: { roles?: { name: string }[] }): boolean {
  return (user.roles || []).some((role) => role.name === OWNER_ROLE_NAME);
}

/**
 * بيحسب نطاق الوصول (AccessScope) للمستخدم من:
 *  1) صلاحياته (كل الفروع / فروع ومخازن محددة) — المالك دايماً «الكل».
 *  2) فرع/مخزن العمل اللي اختاره من صفحة «فرع العمل».
 * مع تجاهل أي اختيار مبقاش صالح (فرع اتمسح أو اتوقف، صلاحية اتشالت، مخزن مش تابع للفرع...).
 */
@Injectable()
export class AccessScopeService {
  constructor(
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    @InjectRepository(Warehouse) private readonly warehouses: Repository<Warehouse>
  ) {}

  async listTenantLocations(tenantId: string) {
    const [branches, warehouses] = await Promise.all([
      this.branches.find({
        where: { tenantId, deletedAt: IsNull() },
        order: { isMain: 'DESC', createdAt: 'ASC' },
      }),
      this.warehouses.find({
        where: { tenantId, deletedAt: IsNull() },
        order: { isMain: 'DESC', createdAt: 'ASC' },
      }),
    ]);
    return { branches, warehouses };
  }

  async resolve(user: ScopeUser): Promise<AccessScope> {
    const { branches, warehouses } = await this.listTenantLocations(user.tenantId);
    return this.compute(user, branches, warehouses);
  }

  compute(
    user: ScopeUser,
    branches: Pick<Branch, 'id' | 'isMain'>[],
    warehouses: (Pick<Warehouse, 'id' | 'branchId'> & { sharedBranchIds?: string[] | null })[]
  ): AccessScope {
    const isOwner = userIsOwner(user);
    const accessAll = isOwner || user.accessAllBranches !== false;
    const branchIdSet = new Set(branches.map((b) => b.id));
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const mainBranchId = (branches.find((b) => b.isMain) || branches[0])?.id || null;

    const allowedBranchIds = accessAll
      ? null
      : (user.allowedBranchIds || []).filter((id) => branchIdSet.has(id));
    // المخزن المسموح لازم يكون تابع لفرع مسموح — أساسي أو مشترك (أو مش مربوط بفرع).
    const allowedWarehouseIds = accessAll
      ? null
      : (user.allowedWarehouseIds || []).filter((id) => {
          const w = warehouseById.get(id);
          return (
            !!w &&
            (!w.branchId || warehouseBranchIds(w).some((b) => (allowedBranchIds || []).includes(b)))
          );
        });

    const branchAllowed = (id: string) => !allowedBranchIds || allowedBranchIds.includes(id);
    const warehouseAllowed = (id: string) =>
      !allowedWarehouseIds || allowedWarehouseIds.includes(id);

    let activeBranchId: string | null = null;
    if (user.activeBranchId && branchIdSet.has(user.activeBranchId)) {
      if (branchAllowed(user.activeBranchId)) activeBranchId = user.activeBranchId;
    }

    // المخزن المشترك بيظهر مع كل فرع بيستخدمه.
    const belongsToBranch = warehouseServesBranch;

    let activeWarehouseId: string | null = null;
    if (user.activeWarehouseId) {
      const w = warehouseById.get(user.activeWarehouseId);
      if (w && warehouseAllowed(w.id) && (!activeBranchId || belongsToBranch(w, activeBranchId))) {
        activeWarehouseId = w.id;
      }
    }

    let warehouseIds: string[] | null;
    if (activeWarehouseId) {
      warehouseIds = [activeWarehouseId];
    } else if (activeBranchId) {
      warehouseIds = warehouses
        .filter((w) => belongsToBranch(w, activeBranchId as string) && warehouseAllowed(w.id))
        .map((w) => w.id);
    } else {
      warehouseIds = allowedWarehouseIds;
    }

    const branchIds = activeBranchId ? [activeBranchId] : allowedBranchIds;

    return {
      isOwner,
      accessAll,
      allowedBranchIds,
      allowedWarehouseIds,
      activeBranchId,
      activeWarehouseId,
      branchIds,
      warehouseIds,
      mainBranchId,
    };
  }
}
