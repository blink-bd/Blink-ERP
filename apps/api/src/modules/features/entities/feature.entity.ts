import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('features')
export class Feature extends BaseEntity {
  @Column({ unique: true, length: 100 })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'name_ar', length: 255 })
  nameAr: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'description_ar', type: 'text', nullable: true })
  descriptionAr?: string;

  @Column({ length: 50, nullable: true })
  category?: string;

  @Column({ length: 50, nullable: true })
  module?: string;

  @Column({ name: 'depends_on', type: 'uuid', array: true, default: () => 'ARRAY[]::UUID[]' })
  dependsOn: string[];

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_core', default: false })
  isCore: boolean;

  @Column({ name: 'requires_plan', default: false })
  requiresPlan: boolean;

  @Column({ nullable: true, length: 50 })
  icon?: string;

  @Column({ nullable: true, length: 7 })
  color?: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_beta', default: false })
  isBeta: boolean;

  @Column({ name: 'config_schema', type: 'jsonb', nullable: true })
  configSchema?: Record<string, any>;

  @Column({ name: 'limits_schema', type: 'jsonb', nullable: true })
  limitsSchema?: Record<string, any>;
}
