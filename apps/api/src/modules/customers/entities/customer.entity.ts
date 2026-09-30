import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';

@Entity('customers')
export class Customer extends TenantBaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code?: string;

  @Column({ length: 50, nullable: true })
  phone?: string;

  @Column({ length: 255, nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ length: 100, nullable: true })
  city?: string;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 4, default: 0 })
  creditLimit: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  balance: number;

  @Column({ name: 'customer_type', length: 50, default: 'retail' })
  customerType: string;

  @Column({ name: 'price_tier', length: 50, default: 'retail' })
  priceTier: string;

  @Column({ name: 'tax_number', length: 100, nullable: true })
  taxNumber?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];
}
