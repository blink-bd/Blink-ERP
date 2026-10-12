import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';
import { Branch } from './branch.entity';
import { Warehouse } from './warehouse.entity';
import { InventoryTransferItem } from './inventory-transfer-item.entity';

export type InventoryTransferStatus = 'pending' | 'approved' | 'rejected';

@Entity('inventory_transfers')
export class InventoryTransfer extends TenantBaseEntity {
  @Column({ name: 'transfer_number', length: 100 })
  transferNumber: string;

  @Column({ name: 'source_branch_id', type: 'uuid' })
  sourceBranchId: string;

  @Column({ name: 'destination_branch_id', type: 'uuid' })
  destinationBranchId: string;

  @Column({ name: 'source_warehouse_id', type: 'uuid' })
  sourceWarehouseId: string;

  @Column({ name: 'destination_warehouse_id', type: 'uuid' })
  destinationWarehouseId: string;

  @Column({ length: 20, default: 'pending' })
  status: InventoryTransferStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy?: string;

  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'source_branch_id' })
  sourceBranch: Branch;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'destination_branch_id' })
  destinationBranch: Branch;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'source_warehouse_id' })
  sourceWarehouse: Warehouse;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'destination_warehouse_id' })
  destinationWarehouse: Warehouse;

  @OneToMany(() => InventoryTransferItem, (item) => item.transfer)
  items: InventoryTransferItem[];
}
