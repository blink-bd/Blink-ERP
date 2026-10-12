import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, EntityManager } from 'typeorm';
import { stripProtected } from '@/common/utils/sanitize';
import { adjustBranchPartyBalance, resolveTenantBranch } from '@/common/utils/branch-accounting';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  async findAll(tenantId: string, search?: string, branchIds?: string[]) {
    const selectedBranches = branchIds?.length ? branchIds : undefined;
    const query = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.deletedAt IS NULL');
    if (search) {
      query.andWhere('(c.name ILIKE :search OR c.phone ILIKE :search)', { search: `%${search}%` });
    }
    if (selectedBranches) {
      query.andWhere(
        `(EXISTS (SELECT 1 FROM sales s WHERE s.tenant_id = c.tenant_id AND s.customer_id = c.id AND s.branch_id IN (:...branchIds))
         OR EXISTS (SELECT 1 FROM branch_party_balances b WHERE b.tenant_id = c.tenant_id AND b.party_type = 'customer' AND b.party_id = c.id AND b.branch_id IN (:...branchIds)))`,
        { branchIds: selectedBranches }
      );
      const entities = await query.orderBy('c.name', 'ASC').getMany();
      const balances = await this.repo.manager.query(
        `SELECT party_id AS "partyId", COALESCE(SUM(balance), 0) AS balance
         FROM branch_party_balances WHERE tenant_id = $1 AND party_type = 'customer'
           AND branch_id = ANY($2::uuid[]) GROUP BY party_id`,
        [tenantId, selectedBranches]
      );
      const balanceMap = new Map(balances.map((row: any) => [row.partyId, Number(row.balance)]));
      const data = entities.map((customer) => ({
        ...customer,
        balance: balanceMap.get(customer.id) || 0,
      }));
      const totalOwed = data.reduce((sum, customer) => sum + Number(customer.balance), 0);
      return { data, totalOwed, branchIds: selectedBranches };
    }
    const customers = await query.orderBy('c.name', 'ASC').getMany();
    const totalOwed = customers.reduce((sum, customer) => sum + Number(customer.balance), 0);
    return { data: customers, totalOwed };
  }

  /** بحث سريع بالهاتف أو الاسم — يستخدم في نقطة البيع للـ Autocomplete */
  async search(tenantId: string, query?: string) {
    const trimmed = query?.trim();
    const builder = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.deletedAt IS NULL');
    if (trimmed) builder.andWhere('(c.name ILIKE :q OR c.phone ILIKE :q)', { q: `%${trimmed}%` });
    return builder.orderBy('c.name', 'ASC').limit(10).getMany();
  }

  async findById(tenantId: string, id: string, manager?: EntityManager): Promise<Customer> {
    const repository = manager ? manager.getRepository(Customer) : this.repo;
    const customer = await repository.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    return customer;
  }

  async create(tenantId: string, data: Partial<Customer>, userId?: string, branchId?: string) {
    const clean = stripProtected(data);
    const previousBalance = Number((clean as any).previousBalance) || 0;
    return this.repo.manager.transaction(async (manager) => {
      const customer = await manager.save(
        manager.create(Customer, {
          ...clean,
          tenantId,
          createdBy: userId,
          previousBalance,
          balance: previousBalance,
          balanceReminderAnchorAt: previousBalance !== 0 ? new Date() : undefined,
        })
      );
      await adjustBranchPartyBalance(
        manager,
        tenantId,
        'customer',
        customer.id,
        previousBalance,
        branchId
      );
      return customer;
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<Customer> & {
      openingBalanceReason?: string;
      updatedBy?: string;
      branchId?: string;
    }
  ) {
    return this.repo.manager.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');
      const clean = stripProtected(data as any);
      delete (clean as any).previousBalance;
      delete (clean as any).openingBalanceReason;
      delete (clean as any).branchId;
      Object.assign(customer, clean);

      if (Object.prototype.hasOwnProperty.call(data, 'previousBalance')) {
        const nextOpening = Number((data as any).previousBalance);
        const before = Number(customer.previousBalance);
        if (!Number.isFinite(nextOpening) || nextOpening < 0) {
          throw new BadRequestException('الرصيد الافتتاحي يجب أن يكون صفراً أو أكبر');
        }
        const delta = nextOpening - before;
        if (Math.abs(delta) > 0.0001) {
          const reason = String((data as any).openingBalanceReason || '').trim();
          if (!reason) throw new BadRequestException('اكتب سبب تعديل الرصيد الافتتاحي');
          const resolvedBranchId = await resolveTenantBranch(manager, tenantId, data.branchId);
          await manager.query(
            `INSERT INTO party_balance_adjustments
               (tenant_id, party_type, customer_id, branch_id, amount, balance_before, balance_after, reason, created_by)
             VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $8)`,
            [
              tenantId,
              id,
              resolvedBranchId || null,
              delta,
              before,
              nextOpening,
              reason,
              (data as any).updatedBy || null,
            ]
          );
          customer.balance = Number(customer.balance) + delta;
          await adjustBranchPartyBalance(
            manager,
            tenantId,
            'customer',
            id,
            delta,
            resolvedBranchId
          );
          customer.balanceReminderAnchorAt = new Date();
          customer.balanceReminderLastSentAt = null;
          await manager.query(
            `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
             WHERE tenant_id = $1 AND party_type = 'customer' AND party_id = $2 AND resolved_at IS NULL`,
            [tenantId, id]
          );
        }
        customer.previousBalance = nextOpening;
      }
      return manager.save(customer);
    });
  }

  async adjustBalance(
    tenantId: string,
    id: string,
    delta: number,
    branchOrManager?: string | EntityManager
  ): Promise<Customer> {
    const manager =
      typeof branchOrManager === 'string' || branchOrManager == null ? undefined : branchOrManager;
    const branchId = typeof branchOrManager === 'string' ? branchOrManager : undefined;
    if (manager) return this.adjustBalanceInTransaction(manager, tenantId, id, delta);
    return this.repo.manager.transaction((transactionManager) =>
      this.adjustBalanceInTransaction(transactionManager, tenantId, id, delta, branchId)
    );
  }

  async adjustBalanceInTransaction(
    manager: EntityManager,
    tenantId: string,
    id: string,
    delta: number,
    branchId?: string
  ): Promise<Customer> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `customer:${tenantId}:${id}`,
    ]);
    const customer = await manager.findOne(Customer, {
      where: { id, tenantId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    const resolvedBranchId = await resolveTenantBranch(manager, tenantId, branchId);
    if (delta < 0 && resolvedBranchId) {
      const [branchBalance] = await manager.query(
        `SELECT COALESCE(balance, 0) AS balance FROM branch_party_balances
         WHERE tenant_id = $1 AND branch_id = $2 AND party_type = 'customer' AND party_id = $3`,
        [tenantId, resolvedBranchId, id]
      );
      if (Number(branchBalance?.balance || 0) + delta < -0.0001) {
        throw new BadRequestException('لا يمكن أن يتجاوز التحصيل رصيد العميل المستحق في هذا الفرع');
      }
    }
    const nextBalance = Number(customer.balance) + delta;
    if (nextBalance < -0.0001) {
      throw new BadRequestException('لا يمكن أن يصبح رصيد العميل سالبًا');
    }
    customer.balance = Math.max(0, nextBalance);
    customer.balanceReminderAnchorAt = new Date();
    customer.balanceReminderLastSentAt = null;
    const saved = await manager.save(customer);
    await adjustBranchPartyBalance(manager, tenantId, 'customer', id, delta, resolvedBranchId);
    await manager.query(
      `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND party_type = 'customer' AND party_id = $2 AND resolved_at IS NULL`,
      [tenantId, id]
    );
    return saved;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const customer = await this.findById(tenantId, id);
    await this.repo.softRemove(customer);
  }

  /** كشف حساب العميل: فواتير البيع (مديونية) + الدفعات (دائن) + المرتجعات (دائن). */
  async statement(tenantId: string, customerId: string, branchIds?: string[]) {
    const customer = await this.findById(tenantId, customerId);
    const selectedBranches = branchIds?.length ? branchIds : null;

    const sales = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", sale_number AS "referenceNumber", sale_date AS date, total AS amount
       FROM sales WHERE tenant_id = $1 AND customer_id = $2 AND status = 'completed'
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY sale_date ASC`,
      [tenantId, customerId, selectedBranches]
    );
    const payments = await this.repo.manager.query(
      `SELECT p.id, p.branch_id AS "branchId", p.reference_number AS "referenceNumber", p.payment_date AS date, p.amount, pm.name_ar AS method
       FROM payments p JOIN payment_methods pm
         ON pm.id = p.payment_method_id AND pm.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.customer_id = $2
         AND ($3::uuid[] IS NULL OR p.branch_id = ANY($3::uuid[]))
       ORDER BY p.payment_date ASC`,
      [tenantId, customerId, selectedBranches]
    );
    const returns = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", return_number AS "referenceNumber", return_date AS date, refund_amount AS amount
       FROM sale_returns WHERE tenant_id = $1 AND customer_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY return_date ASC`,
      [tenantId, customerId, selectedBranches]
    );
    const adjustments = await this.repo.manager.query(
      `SELECT id, branch_id AS "branchId", created_at AS date, amount, balance_before AS "balanceBefore",
              balance_after AS "balanceAfter", reason
       FROM party_balance_adjustments
       WHERE tenant_id = $1 AND party_type = 'customer' AND customer_id = $2
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
       ORDER BY created_at ASC`,
      [tenantId, customerId, selectedBranches]
    );

    const entries = [
      ...sales.map((s: any) => ({
        id: s.id,
        branchId: s.branchId,
        date: s.date,
        type: 'sale',
        referenceNumber: s.referenceNumber,
        debit: Number(s.amount),
        credit: 0,
        description: 'فاتورة بيع',
      })),
      ...payments.map((p: any) => ({
        branchId: p.branchId,
        date: p.date,
        type: 'payment',
        referenceNumber: p.referenceNumber,
        debit: 0,
        credit: Number(p.amount),
        description: `سداد (${p.method})`,
      })),
      ...returns.map((r: any) => ({
        branchId: r.branchId,
        date: r.date,
        type: 'return',
        referenceNumber: r.referenceNumber,
        debit: 0,
        credit: Number(r.amount),
        description: 'مرتجع',
      })),
      ...adjustments.map((a: any) => ({
        id: a.id,
        branchId: a.branchId,
        date: a.date,
        type: 'opening_balance_adjustment',
        referenceNumber: '',
        debit: Number(a.amount) > 0 ? Number(a.amount) : 0,
        credit: Number(a.amount) < 0 ? Math.abs(Number(a.amount)) : 0,
        reason: a.reason,
        description: `تعديل الرصيد الافتتاحي: ${a.reason}`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentBalance = Number(customer.balance);
    if (selectedBranches) {
      const [branchBalance] = await this.repo.manager.query(
        `SELECT COALESCE(SUM(balance), 0) AS balance FROM branch_party_balances
         WHERE tenant_id = $1 AND party_type = 'customer' AND party_id = $2
           AND branch_id = ANY($3::uuid[])`,
        [tenantId, customerId, selectedBranches]
      );
      currentBalance = Number(branchBalance.balance);
    }
    const netMovement = entries.reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
    let running = currentBalance - netMovement;
    const openingBalance = running;
    const withBalance = entries.map((entry) => {
      running = running + entry.debit - entry.credit;
      return { ...entry, balance: running };
    });

    return {
      customer: { ...customer, balance: currentBalance },
      previousBalance: openingBalance,
      entries: withBalance,
      currentBalance,
    };
  }

  /** سداد مبلغ مباشر من العميل (مش مرتبط بفاتورة بعينها). */
  async collectPayment(
    tenantId: string,
    customerId: string,
    amount: number,
    methodId: string,
    notes: string | undefined,
    userId: string,
    branchId?: string
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    return this.repo.manager.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `customer:${tenantId}:${customerId}`,
      ]);
      const customer = await manager.findOne(Customer, {
        where: { id: customerId, tenantId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) throw new NotFoundException('العميل غير موجود');

      const resolvedBranchId = await resolveTenantBranch(manager, tenantId, branchId);
      const [method] = await manager.query(
        `SELECT id FROM payment_methods WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [methodId, tenantId]
      );
      if (!method) throw new BadRequestException('طريقة الدفع غير صالحة لهذا التاجر');

      let availableBalance = Number(customer.balance);
      if (resolvedBranchId) {
        const [branchBalance] = await manager.query(
          `SELECT COALESCE(balance, 0) AS balance FROM branch_party_balances
           WHERE tenant_id = $1 AND branch_id = $2 AND party_type = 'customer' AND party_id = $3`,
          [tenantId, resolvedBranchId, customerId]
        );
        availableBalance = Number(branchBalance?.balance || 0);
      }
      if (amount > Math.max(0, availableBalance)) {
        throw new BadRequestException('مبلغ التحصيل أكبر من رصيد العميل المستحق في هذا الفرع');
      }

      const year = new Date().getFullYear();
      const [counter] = await manager.query(
        `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
         VALUES ($1, 'payment', $2, 2)
         ON CONFLICT (tenant_id, document_type, document_year)
         DO UPDATE SET next_value = document_counters.next_value + 1
         RETURNING next_value - 1 AS value`,
        [tenantId, year]
      );
      const paymentNumber = `PAY-${year}-${String(Number(counter.value)).padStart(4, '0')}`;
      await manager.query(
        `INSERT INTO payments
           (tenant_id, payment_number, customer_id, branch_id, payment_method_id, amount,
            payment_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)`,
        [
          tenantId,
          paymentNumber,
          customerId,
          resolvedBranchId || null,
          methodId,
          amount,
          notes || null,
          userId,
        ]
      );

      customer.balance = Math.max(0, Number(customer.balance) - amount);
      customer.balanceReminderAnchorAt = new Date();
      customer.balanceReminderLastSentAt = null;
      const saved = await manager.save(customer);
      await adjustBranchPartyBalance(
        manager,
        tenantId,
        'customer',
        customerId,
        -amount,
        resolvedBranchId
      );
      await manager.query(
        `UPDATE balance_reminder_events SET resolved_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND party_type = 'customer' AND party_id = $2 AND resolved_at IS NULL`,
        [tenantId, customerId]
      );
      return saved;
    });
  }
}
