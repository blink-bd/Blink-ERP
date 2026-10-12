import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, EntityManager } from 'typeorm';
import { stripProtected } from '@/common/utils/sanitize';
import { adjustBranchPartyBalance, resolveTenantBranch } from '@/common/utils/branch-accounting';
import { Supplier } from './entities/supplier.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import { BalanceRemindersService } from '@/modules/balance-reminders/balance-reminders.service';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier) private readonly repo: Repository<Supplier>,
    private readonly balanceReminders: BalanceRemindersService
  ) {}

  async findAll(tenantId: string, search?: string, branchIds?: string[]) {
    const selectedBranches = branchIds?.length ? branchIds : undefined;
    const query = this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.deletedAt IS NULL');
    if (search) {
      query.andWhere('(s.name ILIKE :search OR s.phone ILIKE :search)', { search: `%${search}%` });
    }
    if (selectedBranches) {
      query.andWhere(
        `(EXISTS (SELECT 1 FROM purchases p WHERE p.tenant_id = s.tenant_id AND p.supplier_id = s.id AND p.branch_id IN (:...branchIds))
         OR EXISTS (SELECT 1 FROM branch_party_balances b WHERE b.tenant_id = s.tenant_id AND b.party_type = 'supplier' AND b.party_id = s.id AND b.branch_id IN (:...branchIds)))`,
        { branchIds: selectedBranches }
      );
      const entities = await query.orderBy('s.name', 'ASC').getMany();
      const balances = await this.repo.manager.query(
        `SELECT party_id AS "partyId", COALESCE(SUM(balance), 0) AS balance
         FROM branch_party_balances WHERE tenant_id = $1 AND party_type = 'supplier'
           AND branch_id = ANY($2::uuid[]) GROUP BY party_id`,
        [tenantId, selectedBranches]
      );
      const balanceMap = new Map(balances.map((row: any) => [row.partyId, Number(row.balance)]));
      const data = entities.map((supplier) => ({
        ...supplier,
        balance: balanceMap.get(supplier.id) || 0,
      }));
      const totalOwed = data.reduce((sum, supplier) => sum + Number(supplier.balance), 0);
      return { data, totalOwed, branchIds: selectedBranches };
    }
    const suppliers = await query.orderBy('s.name', 'ASC').getMany();
    const totalOwed = suppliers.reduce((sum, supplier) => sum + Number(supplier.balance), 0);
    return { data: suppliers, totalOwed };
  }

  async findById(tenantId: string, id: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    return supplier;
  }

  async create(tenantId: string, data: Partial<Supplier>, userId?: string) {
    const clean = stripProtected(data);
    const previousBalance = Number((clean as any).previousBalance) || 0;
    const created = await this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.save(
        manager.create(Supplier, {
          ...clean,
          tenantId,
          createdBy: userId,
          previousBalance,
          balance: previousBalance,
          balanceReminderAnchorAt: previousBalance !== 0 ? new Date() : undefined,
        })
      );
      await adjustBranchPartyBalance(manager, tenantId, 'supplier', supplier.id, previousBalance);
      return supplier;
    });
    await this.balanceReminders.checkSupplierPayablesLimit(tenantId);
    return created;
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<Supplier> & { openingBalanceReason?: string; updatedBy?: string }
  ) {
    const updated = await this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, {
        where: { id, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) throw new NotFoundException('المورد غير موجود');
      const clean = stripProtected(data as any);
      delete (clean as any).previousBalance;
      delete (clean as any).openingBalanceReason;
      Object.assign(supplier, clean);

      if (Object.prototype.hasOwnProperty.call(data, 'previousBalance')) {
        const nextOpening = Number((data as any).previousBalance);
        const before = Number(supplier.previousBalance);
        if (!Number.isFinite(nextOpening) || nextOpening < 0) {
          throw new BadRequestException('الرصيد الافتتاحي يجب أن يكون صفراً أو أكبر');
        }
        const delta = nextOpening - before;
        if (Math.abs(delta) > 0.0001) {
          const reason = String((data as any).openingBalanceReason || '').trim();
          if (!reason) throw new BadRequestException('اكتب سبب تعديل الرصيد الافتتاحي');
          const branchId = await resolveTenantBranch(manager, tenantId);
          await manager.query(
            `INSERT INTO party_balance_adjustments
               (tenant_id, party_type, supplier_id, branch_id, amount, balance_before, balance_after, reason, created_by)
             VALUES ($1, 'supplier', $2, $3, $4, $5, $6, $7, $8)`,
            [
              tenantId,
              id,
              branchId || null,
              delta,
              before,
              nextOpening,
              reason,
              (data as any).updatedBy || null,
            ]
          );
          supplier.balance = Number(supplier.balance) + delta;
          await adjustBranchPartyBalance(manager, tenantId, 'supplier', id, delta, branchId);
          supplier.balanceReminderAnchorAt = new Date();
          supplier.balanceReminderLastSentAt = null;
          await manager.query(
            `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
             WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2 AND resolved_at IS NULL`,
            [tenantId, id]
          );
        }
        supplier.previousBalance = nextOpening;
      }
      return manager.save(supplier);
    });
    await this.balanceReminders.checkSupplierPayablesLimit(tenantId);
    return updated;
  }

  async adjustBalance(
    tenantId: string,
    id: string,
    delta: number,
    branchId?: string
  ): Promise<Supplier> {
    const supplier = await this.repo.manager.transaction((manager) =>
      this.adjustBalanceInTransaction(manager, tenantId, id, delta, branchId)
    );
    await this.balanceReminders.checkSupplierPayablesLimit(tenantId);
    return supplier;
  }

  async adjustBalanceInTransaction(
    manager: EntityManager,
    tenantId: string,
    id: string,
    delta: number,
    branchId?: string
  ): Promise<Supplier> {
    const supplier = await manager.findOne(Supplier, {
      where: { id, tenantId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    supplier.balance = Number(supplier.balance) + delta;
    supplier.balanceReminderAnchorAt = new Date();
    supplier.balanceReminderLastSentAt = null;
    await manager.save(supplier);
    await adjustBranchPartyBalance(manager, tenantId, 'supplier', id, delta, branchId);
    await manager.query(
      `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2 AND resolved_at IS NULL`,
      [tenantId, id]
    );
    return supplier;
  }

  async checkSupplierPayablesLimit(tenantId: string) {
    return this.balanceReminders.checkSupplierPayablesLimitSafely(tenantId);
  }

  async getSupplierPayablesLimitStatus(tenantId: string) {
    return this.balanceReminders.getSupplierPayablesLimitStatus(tenantId);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const supplier = await this.findById(tenantId, id);
    await this.repo.softRemove(supplier);
  }

  /** تسجيل سداد مبلغ للمورد: بينزل من رصيده المستحق ويتحفظ كمرجع دائم. */
  async settle(
    tenantId: string,
    supplierId: string,
    amount: number,
    method: string,
    notes: string | undefined,
    userId: string | undefined,
    branchId?: string
  ): Promise<{ payment: SupplierPayment; supplier: Supplier }> {
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    const settlement = await this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, {
        where: { id: supplierId, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) throw new NotFoundException('المورد غير موجود');
      const resolvedBranchId = await resolveTenantBranch(manager, tenantId, branchId);
      const payment = await manager.save(
        manager.create(SupplierPayment, {
          tenantId,
          supplierId,
          branchId: resolvedBranchId,
          amount,
          method,
          notes,
          paymentDate: new Date(),
          createdBy: userId,
        })
      );
      supplier.balance = Number(supplier.balance) - amount;
      supplier.balanceReminderAnchorAt = new Date();
      supplier.balanceReminderLastSentAt = null;
      const savedSupplier = await manager.save(supplier);
      await adjustBranchPartyBalance(
        manager,
        tenantId,
        'supplier',
        supplierId,
        -amount,
        resolvedBranchId
      );
      await manager.query(
        `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2 AND resolved_at IS NULL`,
        [tenantId, supplierId]
      );
      return { payment, supplier: savedSupplier };
    });
    await this.balanceReminders.checkSupplierPayablesLimit(tenantId);
    return settlement;
  }

  /** كشف حساب المورد: المشتريات (مديونية) + السدادات (دائن). */
  async statement(tenantId: string, supplierId: string, branchIds?: string[]) {
    const supplier = await this.findById(tenantId, supplierId);
    const selectedBranches = branchIds?.length ? branchIds : null;

    const purchases = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", purchase_number AS "referenceNumber", purchase_date AS date, total AS amount, 'purchase' AS type
       FROM purchases WHERE tenant_id = $1 AND supplier_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY purchase_date ASC`,
      [tenantId, supplierId, selectedBranches]
    );

    const payments = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", reference_number AS "referenceNumber", payment_date AS "paymentDate", amount, method
       FROM supplier_payments WHERE tenant_id = $1 AND supplier_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY payment_date ASC`,
      [tenantId, supplierId, selectedBranches]
    );
    const returns = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", created_at AS date, amount, quantity,
              unit_cost AS "unitCost", sale_return_id AS "saleReturnId"
       FROM supplier_returns WHERE tenant_id = $1 AND supplier_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY created_at ASC`,
      [tenantId, supplierId, selectedBranches]
    );
    const adjustments = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", created_at AS date, amount, reason
       FROM party_balance_adjustments
       WHERE tenant_id = $1 AND party_type = 'supplier' AND supplier_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY created_at ASC`,
      [tenantId, supplierId, selectedBranches]
    );

    const entries = [
      ...purchases.map((p: any) => ({
        branchId: p.branchId,
        date: p.date,
        type: 'purchase',
        referenceNumber: p.referenceNumber,
        debit: 0,
        credit: Number(p.amount),
        description: 'فاتورة مشتريات',
      })),
      ...payments.map((p: any) => ({
        branchId: p.branchId,
        date: p.paymentDate,
        type: 'payment',
        referenceNumber: p.referenceNumber,
        debit: Number(p.amount),
        credit: 0,
        description: `سداد (${p.method})`,
      })),
      ...returns.map((r: any) => ({
        id: r.id,
        branchId: r.branchId,
        date: r.date,
        type: 'supplier_return',
        referenceNumber: r.saleReturnId,
        debit: Number(r.amount),
        credit: 0,
        description: 'إرجاع بضاعة للمورد من مرتجع بيع',
      })),
      ...adjustments.map((a: any) => ({
        id: a.id,
        branchId: a.branchId,
        date: a.date,
        type: 'opening_balance_adjustment',
        referenceNumber: '',
        debit: Number(a.amount) < 0 ? Math.abs(Number(a.amount)) : 0,
        credit: Number(a.amount) > 0 ? Number(a.amount) : 0,
        description: `تعديل الرصيد الافتتاحي: ${a.reason}`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentBalance = Number(supplier.balance);
    if (selectedBranches) {
      const [branchBalance] = await this.repo.manager.query(
        `SELECT COALESCE(SUM(balance), 0) AS balance FROM branch_party_balances
         WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2
           AND branch_id = ANY($3::uuid[])`,
        [tenantId, supplierId, selectedBranches]
      );
      currentBalance = Number(branchBalance.balance);
    }
    const netMovement = entries.reduce((sum, entry) => sum + entry.credit - entry.debit, 0);
    let running = currentBalance - netMovement;
    const openingBalance = running;
    const withBalance = entries.map((entry) => {
      running = running + entry.credit - entry.debit;
      return { ...entry, balance: running };
    });

    return {
      supplier: { ...supplier, balance: currentBalance },
      previousBalance: openingBalance,
      entries: withBalance,
      currentBalance,
    };
  }
}
