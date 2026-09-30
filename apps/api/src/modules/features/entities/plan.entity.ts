import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('plans')
export class Plan extends BaseEntity {
  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMonthly?: number;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceYearly?: number;

  @Column({ length: 3, default: 'SAR' })
  currency: string;

  @Column({ name: 'max_users', type: 'int', nullable: true })
  maxUsers?: number;

  @Column({ name: 'max_branches', type: 'int', nullable: true })
  maxBranches?: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ nullable: true, length: 50 })
  badge?: string;
}
