import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('expense_categories')
export class ExpenseCategory extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'name_ar', length: 255 })
  nameAr: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
