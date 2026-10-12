import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '@/modules/products/entities/product.entity';
import { SaleReturn } from './sale-return.entity';

@Entity('sale_return_items')
export class SaleReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'return_id', type: 'uuid' })
  returnId: string;

  @Column({ name: 'sale_item_id', type: 'uuid' })
  saleItemId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
  unitPrice: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4 })
  unitCost: number;

  @Column({ length: 20, default: 'pending' })
  disposition: 'pending' | 'supplier' | 'restocked';

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string;

  @Column({ name: 'new_product_id', type: 'uuid', nullable: true })
  newProductId?: string;

  @Column({ name: 'repair_expense', type: 'decimal', precision: 15, scale: 4, default: 0 })
  repairExpense: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => SaleReturn, (saleReturn) => saleReturn.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  saleReturn: SaleReturn;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
