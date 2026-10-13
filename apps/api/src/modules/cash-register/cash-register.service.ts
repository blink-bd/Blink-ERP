import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AccessScope, UNRESTRICTED_SCOPE, isBranchAllowed } from '@/common/utils/access-scope';
import { stripProtected } from '@/common/utils/sanitize';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterShift } from './entities/cash-register-shift.entity';
import { CashTransaction } from './entities/cash-transaction.entity';
import { tenantYear } from '@/common/utils/tenant-time';

@Injectable()
export class CashRegisterService {
  constructor(
    @InjectRepository(CashRegister) private readonly registersRepository: Repository<CashRegister>,
    @InjectRepository(CashRegisterShift)
    private readonly shiftsRepository: Repository<CashRegisterShift>,
    @InjectRepository(CashTransaction)
    private readonly transactionsRepository: Repository<CashTransaction>
  ) {}

  async getCurrentShift(tenantId: string, userId: string): Promise<CashRegisterShift> {
    const shift = await this.shiftsRepository.findOne({
      where: { tenantId, userId, status: 'open' },
      order: { openedAt: 'DESC' },
    });
    if (!shift) throw new NotFoundException('لا توجد وردية مفتوحة');
    return shift;
  }

  async openShift(
    tenantId: string,
    cashRegisterId: string,
    openingBalance: number,
    notes: string | undefined,
    userId: string
  ): Promise<CashRegisterShift> {
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      throw new BadRequestException('الرصيد الافتتاحي غير صحيح');
    }

    return this.shiftsRepository.manager.transaction(async (manager) => {
      const register = await manager.findOne(CashRegister, {
        where: { id: cashRegisterId, tenantId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!register) throw new NotFoundException('الكاشير غير موجود');
      if (register.isOpen)
        throw new BadRequestException('يوجد وردية مفتوحة بالفعل على هذا الكاشير');

      const year = await tenantYear(manager, tenantId);
      const [counter] = await manager.query(
        `INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
         VALUES ($1, 'shift', $2, 2)
         ON CONFLICT (tenant_id, document_type, document_year)
         DO UPDATE SET next_value = document_counters.next_value + 1
         RETURNING next_value - 1 AS value`,
        [tenantId, year]
      );
      const shift = manager.create(CashRegisterShift, {
        tenantId,
        shiftNumber: `SHIFT-${year}-${String(Number(counter.value)).padStart(4, '0')}`,
        cashRegisterId,
        userId,
        openedAt: new Date(),
        openingBalance,
        openingNotes: notes,
        status: 'open',
      });
      const saved = await manager.save(shift);

      register.isOpen = true;
      register.currentShiftId = saved.id;
      await manager.save(register);
      return saved;
    });
  }

  async closeShift(
    tenantId: string,
    shiftId: string,
    actualCash: number,
    actualCard: number,
    notes: string | undefined
  ): Promise<CashRegisterShift> {
    if (
      !Number.isFinite(actualCash) ||
      actualCash < 0 ||
      !Number.isFinite(actualCard) ||
      actualCard < 0
    ) {
      throw new BadRequestException('الرصيد الفعلي غير صحيح');
    }

    return this.shiftsRepository.manager.transaction(async (manager) => {
      const shift = await manager.findOne(CashRegisterShift, {
        where: { id: shiftId, tenantId, status: 'open' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shift) throw new NotFoundException('الوردية المفتوحة غير موجودة');

      shift.actualCash = actualCash;
      shift.actualCard = actualCard;
      shift.closingNotes = notes;
      shift.closedAt = new Date();
      shift.status = 'closed';
      const saved = await manager.save(shift);

      const register = await manager.findOne(CashRegister, {
        where: { id: shift.cashRegisterId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (register) {
        register.isOpen = false;
        register.currentShiftId = undefined;
        await manager.save(register);
      }

      return saved;
    });
  }

  async addCashTransaction(
    tenantId: string,
    shiftId: string,
    type: 'cash_in' | 'cash_out' | 'expense',
    amount: number,
    description: string | undefined,
    userId: string
  ): Promise<CashTransaction> {
    if (!['cash_in', 'cash_out', 'expense'].includes(type)) {
      throw new BadRequestException('نوع حركة الخزينة غير صحيح');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ حركة الخزينة يجب أن يكون أكبر من صفر');
    }

    return this.shiftsRepository.manager.transaction(async (manager) => {
      // لا نثق في shiftId القادم من العميل: يجب أن تكون الوردية مفتوحة
      // ومملوكة لنفس التاجر قبل إنشاء أي حركة مالية.
      const shift = await manager.findOne(CashRegisterShift, {
        where: { id: shiftId, tenantId, status: 'open' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shift) throw new NotFoundException('الوردية غير موجودة لهذا التاجر');

      const transaction = manager.create(CashTransaction, {
        tenantId,
        shiftId: shift.id,
        type,
        amount,
        description,
        createdBy: userId,
      });
      return manager.save(transaction);
    });
  }

  async findAllRegisters(
    tenantId: string,
    scope: AccessScope = UNRESTRICTED_SCOPE
  ): Promise<CashRegister[]> {
    const all = await this.registersRepository.find({ where: { tenantId } });
    // كاشير مش مربوط بفرع بيظهر للكل؛ غير كده لازم يكون في فرع العمل/الفروع المسموحة.
    if (!scope.branchIds) return all;
    return all.filter((r) => !r.branchId || scope.branchIds!.includes(r.branchId));
  }

  /** يتأكد إن الكاشير (أو كاشير الوردية) تابع لفرع مسموح للمستخدم. */
  async assertRegisterAllowed(
    tenantId: string,
    ids: { registerId?: string; shiftId?: string },
    scope: AccessScope
  ): Promise<void> {
    if (scope.accessAll) return;
    const [row] = ids.registerId
      ? await this.registersRepository.manager.query(
          `SELECT branch_id AS "branchId" FROM cash_registers WHERE id = $1 AND tenant_id = $2`,
          [ids.registerId, tenantId]
        )
      : await this.registersRepository.manager.query(
          `SELECT r.branch_id AS "branchId" FROM cash_register_shifts s
           JOIN cash_registers r ON r.id = s.cash_register_id
           WHERE s.id = $1 AND s.tenant_id = $2`,
          [ids.shiftId, tenantId]
        );
    if (row && row.branchId && !isBranchAllowed(scope, row.branchId)) {
      throw new ForbiddenException('الكاشير ده تابع لفرع مش مسموح لك');
    }
  }

  async createRegister(
    tenantId: string,
    data: Partial<CashRegister>,
    userId?: string
  ): Promise<CashRegister> {
    const clean = stripProtected(data);
    if (clean.branchId) {
      const [branch] = await this.registersRepository.manager.query(
        `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [clean.branchId, tenantId]
      );
      if (!branch) throw new NotFoundException('الفرع غير موجود لهذا التاجر');
    }
    void userId;
    const register = this.registersRepository.create({ ...clean, tenantId });
    return this.registersRepository.save(register);
  }

  /**
   * ملخص الوردية (صفحة «الخزينة»):
   * - مبيعات الوردية حسب طريقة الدفع + الآجل المتبقي منها (بعد خصم المرتجعات).
   * - تحصيلات الوردية على فواتير قديمة أو من حساب العميل (بتاريخ الدفع).
   * - المرتجعات والمبالغ المردودة للعملاء حسب طريقة الرد (بتنزل من الخزنة/التحويلات).
   * - المصروفات وحركات الإيداع/السحب، والمتبقي بالخزينة.
   * لو الخزينة مربوطة بفرع، الحسابات بتقتصر على الفرع ده.
   */
  async shiftSummary(tenantId: string, shiftId: string) {
    const shift = await this.shiftsRepository.findOne({ where: { id: shiftId, tenantId } });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');

    const endDate = shift.closedAt || new Date();
    const manager = this.shiftsRepository.manager;
    const [register] = await manager.query(
      `SELECT branch_id AS "branchId" FROM cash_registers WHERE id = $1 AND tenant_id = $2`,
      [shift.cashRegisterId, tenantId]
    );
    const branchId: string | null = register?.branchId || null;
    const params = [tenantId, shift.openedAt, endDate, branchId];

    const [salesByMethod] = await manager.query(
      `SELECT
         COALESCE(SUM(by_sale.cash), 0) AS cash,
         COALESCE(SUM(by_sale.card), 0) AS card,
         COALESCE(SUM(by_sale.bank_transfer), 0) AS "bankTransfer",
         COALESCE(SUM(by_sale.credit), 0) AS credit,
         COALESCE(SUM(by_sale.total), 0) AS total,
         COUNT(*)::int AS count
       FROM (
         SELECT s.id, s.total,
           COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'cash'), 0) AS cash,
           COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'card'), 0) AS card,
           COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'bank_transfer'), 0) AS bank_transfer,
           GREATEST(
             s.total - s.paid_amount - COALESCE((
               SELECT SUM(r.invoice_credit) FROM sale_returns r
               WHERE r.tenant_id = s.tenant_id AND r.original_sale_id = s.id
             ), 0),
             0
           ) AS credit
         FROM sales s
         LEFT JOIN payments p ON p.sale_id = s.id AND p.tenant_id = $1
           AND p.payment_date BETWEEN $2 AND $3
         LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id AND pm.tenant_id = $1
         WHERE s.tenant_id = $1 AND s.status = 'completed'
           AND s.sale_date BETWEEN $2 AND $3
           AND ($4::uuid IS NULL OR s.branch_id = $4)
         GROUP BY s.id, s.total, s.paid_amount
       ) AS by_sale`,
      params
    );

    // تحصيلات اتقبضت في الوردية على فواتير قبلها أو كسداد من حساب العميل.
    const [collections] = await manager.query(
      `SELECT
         COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'cash'), 0) AS cash,
         COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'card'), 0) AS card,
         COALESCE(SUM(p.amount) FILTER (WHERE pm.code = 'bank_transfer'), 0) AS "bankTransfer"
       FROM payments p
       JOIN payment_methods pm ON pm.id = p.payment_method_id AND pm.tenant_id = $1
       LEFT JOIN sales s ON s.id = p.sale_id AND s.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.payment_date BETWEEN $2 AND $3
         AND (p.sale_id IS NULL OR s.sale_date < $2)
         AND ($4::uuid IS NULL OR p.branch_id = $4)`,
      params
    );

    const [returnsRow] = await manager.query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(SUM(r.total), 0) AS total,
         COALESCE(SUM(r.invoice_credit), 0) AS "invoiceCredit",
         COALESCE(SUM(r.account_credit), 0) AS "accountCredit",
         COALESCE(SUM(r.refund_paid) FILTER (WHERE COALESCE(pm.code, 'cash') = 'cash'), 0) AS cash,
         COALESCE(SUM(r.refund_paid) FILTER (WHERE pm.code = 'card'), 0) AS card,
         COALESCE(SUM(r.refund_paid) FILTER (WHERE pm.code = 'bank_transfer'), 0) AS "bankTransfer",
         COALESCE(SUM(r.refund_paid) FILTER (
           WHERE pm.code IS NOT NULL AND pm.code NOT IN ('cash', 'card', 'bank_transfer')
         ), 0) AS other
       FROM sale_returns r
       LEFT JOIN payment_methods pm ON pm.id = r.refund_method_id AND pm.tenant_id = $1
       WHERE r.tenant_id = $1 AND r.return_date BETWEEN $2 AND $3
         AND ($4::uuid IS NULL OR r.branch_id = $4)`,
      params
    );

    const [cashTxns] = await this.transactionsRepository.manager.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0) AS "cashIn",
         COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0) AS "cashOut"
       FROM cash_transactions WHERE shift_id = $1 AND tenant_id = $2`,
      [shiftId, tenantId]
    );

    const [expensesRow] = await manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE shift_id = $1 AND tenant_id = $2`,
      [shiftId, tenantId]
    );

    const n = (value: unknown) => Math.round(Number(value || 0) * 10000) / 10000;
    const cash = n(salesByMethod.cash);
    const card = n(salesByMethod.card);
    const bankTransfer = n(salesByMethod.bankTransfer);
    const credit = n(salesByMethod.credit);
    const salesTotal = n(salesByMethod.total);
    const collected = {
      cash: n(collections.cash),
      card: n(collections.card),
      bankTransfer: n(collections.bankTransfer),
    };
    const refunds = {
      cash: n(returnsRow.cash),
      card: n(returnsRow.card),
      bankTransfer: n(returnsRow.bankTransfer),
      other: n(returnsRow.other),
    };
    const returnsTotal = n(returnsRow.total);
    const expensesTotal = n(expensesRow.total);
    const cashIn = n(cashTxns.cashIn);
    const cashOut = n(cashTxns.cashOut);

    const expectedCashInDrawer =
      Number(shift.openingBalance) +
      cash +
      collected.cash +
      cashIn -
      cashOut -
      expensesTotal -
      refunds.cash;

    return {
      shift,
      branchId,
      sales: {
        cash,
        card,
        bankTransfer,
        credit,
        // إجمالي فواتير الوردية (قبل المرتجعات) وصافيها بعد مرتجعات الوردية.
        total: salesTotal,
        count: Number(salesByMethod.count || 0),
        net: n(salesTotal - returnsTotal),
      },
      collections: {
        ...collected,
        total: n(collected.cash + collected.card + collected.bankTransfer),
      },
      returns: {
        count: Number(returnsRow.count || 0),
        total: returnsTotal,
        // اتخصم من الآجل على الفواتير / من مديونية العميل.
        invoiceCredit: n(returnsRow.invoiceCredit),
        accountCredit: n(returnsRow.accountCredit),
        refunds: {
          ...refunds,
          total: n(refunds.cash + refunds.card + refunds.bankTransfer + refunds.other),
        },
      },
      expenses: expensesTotal,
      cashMovements: { cashIn, cashOut },
      remaining: {
        cash: n(expectedCashInDrawer),
        card: n(card + collected.card - refunds.card),
        bankTransfer: n(bankTransfer + collected.bankTransfer - refunds.bankTransfer),
        credit,
      },
    };
  }
}
