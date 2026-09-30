import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { PurchaseItem } from './purchase-item.entity';

@Entity('purchases')
export class Purchase extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'purchase_number', length: 100 })
  purchaseNumber: string;

  @Column({ name: 'supplier_invoice_number', length: 100, nullable: true })
  supplierInvoiceNumber?: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ name: 'purchase_date', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  purchaseDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ name: 'shipping_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  shippingCost: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  paidAmount: number;

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
  paymentStatus: string;

  @Column({ length: 20, default: 'completed' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @OneToMany(() => PurchaseItem, (item) => item.purchase)
  items: PurchaseItem[];
}
