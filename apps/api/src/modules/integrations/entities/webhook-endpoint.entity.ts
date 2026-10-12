import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';

@Entity('webhook_endpoints')
export class WebhookEndpoint extends TenantBaseEntity {
  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'secret_ciphertext', type: 'text' })
  secretCiphertext: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  events: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
