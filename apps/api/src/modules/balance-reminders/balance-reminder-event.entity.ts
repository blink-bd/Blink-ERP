import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('balance_reminder_events')
export class BalanceReminderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'party_type', length: 20 })
  partyType: 'customer' | 'supplier';

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @Column({ name: 'party_name', length: 255 })
  partyName: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  balance: number;

  @Column({ name: 'reminder_days', type: 'int' })
  reminderDays: number;

  @Column({ name: 'due_at', type: 'timestamp' })
  dueAt: Date;

  @Column({ name: 'notified_at', type: 'timestamp' })
  notifiedAt: Date;

  @Column({ name: 'email_status', length: 20, default: 'skipped' })
  emailStatus: 'sent' | 'skipped' | 'failed';

  @Column({ name: 'whatsapp_status', length: 20, default: 'skipped' })
  whatsappStatus: 'sent' | 'skipped' | 'failed';

  @Column({ name: 'snoozed_at', type: 'timestamp', nullable: true })
  snoozedAt?: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
