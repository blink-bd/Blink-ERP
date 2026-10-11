import { stripProtected } from '@/common/utils/sanitize';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeaturesService } from '@/modules/features/features.service';
import { assertCanAddLocation, assertWarehouseUsable } from './location-limits';
import { UpdateWarehouseDto, WarehouseDto } from './dto/location.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse) private readonly repo: Repository<Warehouse>,
    private readonly features: FeaturesService
  ) {}

  /**
   * لو ميزة المخازن المتعددة مقفولة بنرجع المخزن الرئيسي بس (عشان الواجهات
   * ونقطة البيع ما تعرضش مخازن غير مسموح استخدامها). includeAll للإدارة.
   */
  async findAll(tenantId: string, includeAll = false) {
    const all = await this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { isMain: 'DESC', createdAt: 'ASC' },
    });
    if (includeAll || (await this.features.tenantHasFeature(tenantId, 'warehouses'))) return all;
    return all.filter((w) => w.isMain);
  }

  async findById(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!warehouse) throw new NotFoundException('المخزن غير موجود');
    return warehouse;
  }

  /** يرجع المخزن بعد التأكد إنه مسموح استخدامه في الحركات (حسب ميزة المخازن المتعددة). */
  async findUsable(tenantId: string, id: string): Promise<Warehouse> {
    await assertWarehouseUsable(this.repo.manager, this.features, tenantId, id);
    return this.findById(tenantId, id);
  }

  async findOrCreateDefault(tenantId: string, userId?: string): Promise<Warehouse> {
    const existing = await this.repo.findOne({
      where: { tenantId, isMain: true, deletedAt: IsNull() },
    });
    if (existing) return existing;
    const warehouse = this.repo.create({
      tenantId,
      name: 'المخزن الرئيسي',
      code: 'MAIN',
      isMain: true,
      createdBy: userId,
    });
    return this.repo.save(warehouse);
  }

  async create(tenantId: string, data: WarehouseDto, userId?: string) {
    await assertCanAddLocation(this.repo.manager, this.features, tenantId, 'warehouses');
    const clean = stripProtected(data) as Partial<Warehouse>;
    await this.assertBranchReference(tenantId, clean.branchId);
    const existing = await this.repo.count({ where: { tenantId, deletedAt: IsNull() } });
    const warehouse = this.repo.create({
      ...clean,
      branchId: clean.branchId ?? undefined,
      tenantId,
      isMain: existing === 0,
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
    await this.assertBranchReference(tenantId, clean.branchId);
    Object.assign(warehouse, clean, { updatedBy: userId });
    return this.repo.save(warehouse);
  }

  private async assertBranchReference(tenantId: string, branchId?: string | null) {
    if (!branchId) return;
    const [branch] = await this.repo.manager.query(
      `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [branchId, tenantId]
    );
    if (!branch) throw new NotFoundException('الفرع غير موجود لهذا التاجر');
  }
}
