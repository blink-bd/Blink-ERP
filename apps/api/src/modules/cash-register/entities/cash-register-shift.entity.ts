import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('cash_register_shifts')
export class CashRegisterShift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'shift_number', length: 100 })
  shiftNumber: string;

  @Column({ name: 'cash_register_id', type: 'uuid' })
  cashRegisterId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'opened_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  openedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt?: Date;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 15, scale: 4 })
  openingBalance: number;

  @Column({ name: 'opening_notes', type: 'text', nullable: true })
  openingNotes?: string;

  @Column({ name: 'expected_cash_sales', type: 'decimal', precision: 15, scale: 4, default: 0 })
  expectedCashSales: number;

  @Column({ name: 'expected_card_sales', type: 'decimal', precision: 15, scale: 4, default: 0 })
  expectedCardSales: number;

  @Column({ name: 'expected_expenses', type: 'decimal', precision: 15, scale: 4, default: 0 })
  expectedExpenses: number;

  @Column({ name: 'actual_cash', type: 'decimal', precision: 15, scale: 4, nullable: true })
  actualCash?: number;

  @Column({ name: 'actual_card', type: 'decimal', precision: 15, scale: 4, nullable: true })
  actualCard?: number;

  @Column({ name: 'closing_notes', type: 'text', nullable: true })
  closingNotes?: string;

  @Column({ length: 20, default: 'open' })
  status: 'open' | 'closed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
