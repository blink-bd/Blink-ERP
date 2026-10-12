import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('invoice_attachments')
export class InvoiceAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ name: 'entity_type', length: 20 })
  entityType: 'sale' | 'purchase';

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'object_key', type: 'text' })
  objectKey: string;

  @Column({ name: 'storage_provider', length: 20 })
  storageProvider: 's3' | 'local' | 'database';

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'bytea', select: false })
  content: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
