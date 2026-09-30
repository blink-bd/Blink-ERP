import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('payment_methods')
export class PaymentMethod extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr: string;

  @Column({ length: 50 })
  code: string;

  @Column({ name: 'requires_reference', default: false })
  requiresReference: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;
}
