import { stripProtected } from '@/common/utils/sanitize';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { FeaturesService } from '@/modules/features/features.service';
import { assertCanAddLocation } from './location-limits';
import { BranchDto, UpdateBranchDto } from './dto/location.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch) private readonly repo: Repository<Branch>,
    private readonly features: FeaturesService
  ) {}

  findAll(tenantId: string) {
    return this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { isMain: 'DESC', createdAt: 'ASC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Branch> {
    const branch = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    return branch;
  }

  async create(tenantId: string, data: BranchDto, userId?: string) {
    await assertCanAddLocation(this.repo.manager, this.features, tenantId, 'branches');
    const existing = await this.repo.count({ where: { tenantId, deletedAt: IsNull() } });
    const branch = this.repo.create({
      ...stripProtected(data),
      tenantId,
      isMain: existing === 0, // أول فرع هو الرئيسي
      createdBy: userId,
    });
    return this.repo.save(branch);
  }

  async update(tenantId: string, id: string, data: UpdateBranchDto, userId?: string) {
    const branch = await this.findById(tenantId, id);
    if (data.isActive === false && branch.isMain) {
      throw new BadRequestException('لا يمكن إيقاف الفرع الرئيسي');
    }
    Object.assign(branch, stripProtected(data), { updatedBy: userId });
    return this.repo.save(branch);
  }
}
