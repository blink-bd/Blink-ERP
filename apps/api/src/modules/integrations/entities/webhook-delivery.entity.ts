import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';

@Entity('webhook_deliveries')
export class WebhookDelivery extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ length: 20 })
  status: 'succeeded' | 'failed';

  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus?: number;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'attempted_at', type: 'timestamp' })
  attemptedAt: Date;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt?: Date;
}
