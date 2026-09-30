import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { Feature } from './feature.entity';

@Entity('tenant_features')
export class TenantFeature extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId: string;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  limits: Record<string, any>;

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
  trialEndsAt?: Date;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'enabled_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  enabledAt: Date;

  @Column({ name: 'enabled_by', type: 'uuid', nullable: true })
  enabledBy?: string;

  @Column({ name: 'disabled_at', type: 'timestamp', nullable: true })
  disabledAt?: Date;

  @Column({ name: 'disabled_by', type: 'uuid', nullable: true })
  disabledBy?: string;

  @ManyToOne(() => Feature)
  @JoinColumn({ name: 'feature_id' })
  feature: Feature;
}
