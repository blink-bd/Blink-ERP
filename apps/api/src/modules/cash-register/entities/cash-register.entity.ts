import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('cash_registers')
export class CashRegister extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code?: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'current_shift_id', type: 'uuid', nullable: true })
  currentShiftId?: string;

  @Column({ name: 'is_open', default: false })
  isOpen: boolean;
}
