import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { InventoryTransfer } from './inventory-transfer.entity';
import { Product } from '@/modules/products/entities/product.entity';

@Entity('inventory_transfer_items')
export class InventoryTransferItem extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4, nullable: true })
  unitCost?: number;

  @ManyToOne(() => InventoryTransfer, (transfer) => transfer.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: InventoryTransfer;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
