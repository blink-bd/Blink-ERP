import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type InventoryTransactionType =
  | 'purchase' | 'sale' | 'return_in' | 'return_out'
  | 'adjustment' | 'transfer_in' | 'transfer_out' | 'opening_balance' | 'damage';

@Entity('inventory_transactions')
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @Column({ length: 50 })
  type: InventoryTransactionType;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4, nullable: true })
  unitCost?: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 15, scale: 4 })
  balanceAfter: number;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;
}
