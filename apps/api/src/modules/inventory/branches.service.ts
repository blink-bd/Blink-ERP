import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Branch } from './entities/branch.entity';

@Injectable()
export class BranchesService {
  constructor(@InjectRepository(Branch) private readonly repo: Repository<Branch>) {}

  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId, deletedAt: IsNull() } });
  }

  async findById(tenantId: string, id: string): Promise<Branch> {
    const branch = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    return branch;
  }

  create(tenantId: string, data: Partial<Branch>, userId?: string) {
    const branch = this.repo.create({ ...stripProtected(data), tenantId, createdBy: userId });
    return this.repo.save(branch);
  }

  async update(tenantId: string, id: string, data: Partial<Branch>) {
    const branch = await this.findById(tenantId, id);
    Object.assign(branch, stripProtected(data));
    return this.repo.save(branch);
  }
}
