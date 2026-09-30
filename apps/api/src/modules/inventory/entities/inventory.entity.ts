import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Product } from '@/modules/products/entities/product.entity';
import { Warehouse } from './warehouse.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantity: number;

  @Column({ name: 'reserved_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reservedQuantity: number;

  @Column({
    name: 'available_quantity',
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    insert: false,
    update: false,
  })
  availableQuantity: number;

  @Column({ name: 'weighted_avg_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  weightedAvgCost: number;

  @Column({ name: 'last_cost', type: 'decimal', precision: 15, scale: 4, default: 0 })
  lastCost: number;

  @Column({ default: 1 })
  version: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;
}
