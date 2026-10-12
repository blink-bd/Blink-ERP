import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('maintenance_invoices')
export class MaintenanceInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'customer_name', length: 255 })
  customerName: string;

  @Column({ name: 'customer_phone', length: 50, nullable: true })
  customerPhone?: string;

  @Column({ name: 'customer_email', length: 255, nullable: true })
  customerEmail?: string;

  @Column({ name: 'product_name', length: 500 })
  productName: string;

  @Column({ name: 'product_model', length: 255, nullable: true })
  productModel?: string;

  @Column({ name: 'product_serial', length: 255, nullable: true })
  productSerial?: string;

  @Column({ name: 'product_notes', type: 'text', nullable: true })
  productNotes?: string;

  @Column({ name: 'maintenance_description', type: 'text' })
  maintenanceDescription: string;

  @Column({ name: 'parts_description', type: 'text', nullable: true })
  partsDescription?: string;

  @Column({ name: 'parts_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  partsCost: number;

  @Column({ name: 'service_price', type: 'decimal', precision: 15, scale: 4, default: 0 })
  servicePrice: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, insert: false, update: false })
  profit: number;

  @Column({ length: 20, default: 'completed' })
  status: string;

  @Column({ name: 'maintenance_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  maintenanceDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;
}
