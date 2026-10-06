import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sale } from './sale.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'product_name', length: 500 })
  productName: string;

  @Column({ name: 'product_sku', length: 100, nullable: true })
  productSku?: string;

  @Column({ name: 'product_barcode', length: 100, nullable: true })
  productBarcode?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ length: 50, nullable: true })
  unit?: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
  unitPrice: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4 })
  unitCost: number;

  @ManyToOne(() => Sale, (sale) => sale.items)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  returnedQuantity?: number;
  remainingQuantity?: number;
}
