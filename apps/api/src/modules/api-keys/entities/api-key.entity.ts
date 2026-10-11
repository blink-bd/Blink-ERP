import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('api_keys')
export class ApiKey extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  /** أول جزء من المفتاح للتعرّف عليه في الواجهة (مش سري) */
  @Column({ name: 'key_prefix', length: 20 })
  keyPrefix: string;

  /** بصمة SHA-256 للمفتاح — المفتاح نفسه لا يُخزَّن أبداً */
  @Column({ name: 'key_hash', type: 'char', length: 64, select: false })
  keyHash: string;

  @Column({ type: 'text', array: true, default: () => 'ARRAY[]::TEXT[]' })
  permissions: string[];

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date | null;

  @Column({ name: 'last_used_ip', type: 'varchar', length: 45, nullable: true })
  lastUsedIp?: string | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string | null;
}
