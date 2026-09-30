import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';

@Entity('warehouses')
export class Warehouse extends TenantBaseEntity {
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'is_main', default: false })
  isMain: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
