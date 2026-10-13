import { stripProtected } from '@/common/utils/sanitize';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { FeaturesService } from '@/modules/features/features.service';
import { assertCanAddLocation, assertWarehouseUsable } from './location-limits';
import { UpdateWarehouseDto, WarehouseDto } from './dto/location.dto';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse) private readonly repo: Repository<Warehouse>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    private readonly features: FeaturesService
  ) {}

  async findAll(tenantId: string, includeAll = false) {
    // Keep accepting the legacy query flag, but never let it bypass tenant features.
    void includeAll;
    const all = await this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { isMain: 'DESC', createdAt: 'ASC' },
    });
    const multipleWarehousesEnabled = await this.features.tenantHasFeature(tenantId, 'warehouses');
    // A query parameter must never bypass the tenant's feature gate.
    if (multipleWarehousesEnabled) return all;
    return all.filter((warehouse) => warehouse.isMain);
  }

  async findById(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!warehouse) throw new NotFoundException('المخزن غير موجود');
    return warehouse;
  }

  async findUsable(tenantId: string, id: string): Promise<Warehouse> {
    await assertWarehouseUsable(this.repo.manager, this.features, tenantId, id);
    return this.findById(tenantId, id);
  }

  private async findOrCreateMainBranch(tenantId: string, userId?: string): Promise<Branch> {
    let branch = await this.branches.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (!branch) {
      branch = await this.branches.save(
        this.branches.create({
          tenantId,
          name: 'الفرع الرئيسي',
          code: `MAIN-${tenantId.slice(0, 8)}`,
          isMain: true,
          isActive: true,
          createdBy: userId,
        })
      );
    }
    if (!branch.isActive) throw new BadRequestException('الفرع الرئيسي غير نشط');
    return branch;
  }

  async findOrCreateDefault(tenantId: string, userId?: string): Promise<Warehouse> {
    const branch = await this.findOrCreateMainBranch(tenantId, userId);
    let warehouse = await this.repo.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (warehouse) {
      if (!warehouse.branchId) {
        warehouse.branchId = branch.id;
        await this.repo.save(warehouse);
      }
      return warehouse;
    }
    warehouse = this.repo.create({
      tenantId,
      branchId: branch.id,
      name: 'المخزن الرئيسي',
      code: 'MAIN',
      isMain: true,
      isActive: true,
      createdBy: userId,
    });
    return this.repo.save(warehouse);
  }

  async create(tenantId: string, data: WarehouseDto, userId?: string) {
    await assertCanAddLocation(this.repo.manager, this.features, tenantId, 'warehouses');
    const clean = stripProtected(data) as Partial<Warehouse>;
    const branchId = clean.branchId || (await this.findOrCreateMainBranch(tenantId, userId)).id;
    await this.assertActiveTenantBranch(tenantId, branchId);
    const existing = await this.repo.count({ where: { tenantId, deletedAt: IsNull() } });
    const warehouse = this.repo.create({
      ...clean,
      branchId,
      tenantId,
      isMain: existing === 0,
      isActive: clean.isActive ?? true,
      createdBy: userId,
    });
    return this.repo.save(warehouse);
  }

  async update(tenantId: string, id: string, data: UpdateWarehouseDto, userId?: string) {
    const warehouse = await this.findById(tenantId, id);
    const clean = stripProtected(data) as Partial<Warehouse>;
    if (clean.isActive === false && warehouse.isMain) {
      throw new BadRequestException('لا يمكن إيقاف المخزن الرئيسي');
    }
    const branchId =
      clean.branchId === undefined
        ? warehouse.branchId
        : clean.branchId || (await this.findOrCreateMainBranch(tenantId, userId)).id;
    if (branchId) await this.assertActiveTenantBranch(tenantId, branchId);
    Object.assign(warehouse, clean, { branchId, updatedBy: userId });
    // الفرع الأساسي مايتكررش في قايمة الفروع المشتركة.
    warehouse.sharedBranchIds = (warehouse.sharedBranchIds || []).filter((id) => id !== branchId);
    return this.repo.save(warehouse);
  }

  /**
   * يخلّي فرع يستخدم مخزن موجود (حتى لو المخزن تابع لفرع تاني) — مخزن مشترك.
   * مش بيضيف مخزن جديد، فمش محتاج ميزة «المخازن المتعددة».
   */
  async linkBranch(tenantId: string, id: string, branchId: string, userId?: string) {
    const warehouse = await this.findById(tenantId, id);
    await this.assertActiveTenantBranch(tenantId, branchId);
    if (!warehouse.isActive) throw new BadRequestException('المخزن ده موقوف');
    if (!warehouse.isMain && !(await this.features.tenantHasFeature(tenantId, 'warehouses'))) {
      throw new BadRequestException(
        'من غير ميزة «المخازن المتعددة» تقدر تربط الفروع بالمخزن الرئيسي بس'
      );
    }
    if (!warehouse.branchId) {
      // مخزن قديم مش مربوط بأي فرع: الفرع ده يبقى فرعه الأساسي.
      warehouse.branchId = branchId;
    } else if (warehouse.branchId === branchId) {
      throw new BadRequestException('المخزن ده أصلاً تابع للفرع ده');
    } else if ((warehouse.sharedBranchIds || []).includes(branchId)) {
      throw new BadRequestException('الفرع ده مربوط بالمخزن ده بالفعل');
    } else {
      warehouse.sharedBranchIds = [...(warehouse.sharedBranchIds || []), branchId];
    }
    warehouse.updatedBy = userId;
    return this.repo.save(warehouse);
  }

  /** يفك ربط فرع مشترك من المخزن (الفرع الأساسي مايتفكش — غيّره بربط المخزن بفرع تاني). */
  async unlinkBranch(tenantId: string, id: string, branchId: string, userId?: string) {
    const warehouse = await this.findById(tenantId, id);
    if (warehouse.branchId === branchId) {
      throw new BadRequestException('ده الفرع الأساسي للمخزن ومينفعش يتفك');
    }
    if (!(warehouse.sharedBranchIds || []).includes(branchId)) {
      throw new BadRequestException('الفرع ده مش مربوط بالمخزن ده');
    }
    warehouse.sharedBranchIds = warehouse.sharedBranchIds.filter((b) => b !== branchId);
    warehouse.updatedBy = userId;
    return this.repo.save(warehouse);
  }

  private async assertActiveTenantBranch(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.branches.findOne({
      where: { id: branchId, tenantId, isActive: true, deletedAt: IsNull() },
    });
    if (!branch) throw new NotFoundException('الفرع المحدد غير موجود أو غير نشط لهذا التاجر');
  }
}
