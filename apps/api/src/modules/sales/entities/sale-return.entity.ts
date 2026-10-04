import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('sale_returns')
export class SaleReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'return_number', length: 100 })
  returnNumber: string;

  @Column({ name: 'original_sale_id', type: 'uuid' })
  originalSaleId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ name: 'return_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  returnDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total: number;

  @Column({ name: 'refund_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  refundAmount: number;

  @Column({ name: 'cogs_adjustment', type: 'decimal', precision: 15, scale: 4, default: 0 })
  cogsAdjustment: number;

  @Column({ length: 20, default: 'completed' })
  status: string;

  @Column({ length: 255, nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
