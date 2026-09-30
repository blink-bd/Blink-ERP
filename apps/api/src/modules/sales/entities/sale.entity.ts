import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { SaleItem } from './sale-item.entity';

@Entity('sales')
export class Sale extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'sale_number', length: 100 })
  saleNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ name: 'cash_register_id', type: 'uuid', nullable: true })
  cashRegisterId?: string;

  @Column({ name: 'sale_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  saleDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  paidAmount: number;

  @Column({ name: 'change_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  changeAmount: number;

  @Column({
    name: 'remaining_amount',
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    insert: false,
    update: false,
  })
  remainingAmount: number;

  @Column({ name: 'payment_status', length: 20, default: 'pending' })
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue';

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  cogs: number;

  @Column({
    name: 'gross_profit',
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    insert: false,
    update: false,
  })
  grossProfit: number;

  @Column({ length: 20, default: 'completed' })
  status: 'draft' | 'completed' | 'cancelled' | 'returned';

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'voided_at', type: 'timestamp', nullable: true })
  voidedAt?: Date;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy?: string;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason?: string;

  @OneToMany(() => SaleItem, (item) => item.sale)
  items: SaleItem[];
}
