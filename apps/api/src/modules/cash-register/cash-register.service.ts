import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterShift } from './entities/cash-register-shift.entity';
import { CashTransaction } from './entities/cash-transaction.entity';

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
    const register = await this.registersRepository.findOne({
      where: { id: cashRegisterId, tenantId },
    });
    if (!register) throw new NotFoundException('الكاشير غير موجود');
    if (register.isOpen) throw new BadRequestException('يوجد وردية مفتوحة بالفعل على هذا الكاشير');

    const count = await this.shiftsRepository.count({ where: { tenantId } });
    const shift = this.shiftsRepository.create({
      tenantId,
      shiftNumber: `SHIFT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      cashRegisterId,
      userId,
      openedAt: new Date(),
      openingBalance,
      openingNotes: notes,
      status: 'open',
    });
    const saved = await this.shiftsRepository.save(shift);

    register.isOpen = true;
    register.currentShiftId = saved.id;
    await this.registersRepository.save(register);

    return saved;
  }

  async closeShift(
    tenantId: string,
    shiftId: string,
    actualCash: number,
    actualCard: number,
    notes: string | undefined
  ): Promise<CashRegisterShift> {
    const shift = await this.shiftsRepository.findOne({ where: { id: shiftId, tenantId } });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');

    shift.actualCash = actualCash;
    shift.actualCard = actualCard;
    shift.closingNotes = notes;
    shift.closedAt = new Date();
    shift.status = 'closed';
    const saved = await this.shiftsRepository.save(shift);

    const register = await this.registersRepository.findOne({
      where: { id: shift.cashRegisterId, tenantId },
    });
    if (register) {
      register.isOpen = false;
      register.currentShiftId = undefined;
      await this.registersRepository.save(register);
    }

    return saved;
  }

  async addCashTransaction(
    tenantId: string,
    shiftId: string,
    type: 'cash_in' | 'cash_out' | 'expense',
    amount: number,
    description: string | undefined,
    userId: string
  ): Promise<CashTransaction> {
    const transaction = this.transactionsRepository.create({
      tenantId,
      shiftId,
      type,
      amount,
      description,
      createdBy: userId,
    });
    return this.transactionsRepository.save(transaction);
  }

  async findAllRegisters(tenantId: string): Promise<CashRegister[]> {
    return this.registersRepository.find({ where: { tenantId } });
  }

  async createRegister(
    tenantId: string,
    data: Partial<CashRegister>,
    userId?: string
  ): Promise<CashRegister> {
    void userId;
    const register = this.registersRepository.create({ ...stripProtected(data), tenantId });
    return this.registersRepository.save(register);
  }

  /**
   * ملخص الوردية: مبيعات نقدي/بطاقة/تحويل/آجل + المصروفات + المتبقي بالخزينة.
   * مطلوب لصفحة "الخزينة" (بند 10 من طلبات التاجر).
   */
  async shiftSummary(tenantId: string, shiftId: string) {
    const shift = await this.shiftsRepository.findOne({ where: { id: shiftId, tenantId } });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');

    const endDate = shift.closedAt || new Date();

    const [salesByMethod] = await this.shiftsRepository.manager.query(
      `SELECT
         COALESCE(SUM(s.total) FILTER (WHERE pm.code = 'cash'), 0) AS cash,
         COALESCE(SUM(s.total) FILTER (WHERE pm.code = 'card'), 0) AS card,
         COALESCE(SUM(s.total) FILTER (WHERE pm.code = 'bank_transfer'), 0) AS "bankTransfer",
         COALESCE(SUM(s.total) FILTER (WHERE s.payment_status IN ('pending','partial')), 0) AS credit
       FROM sales s
       LEFT JOIN payments p ON p.sale_id = s.id
       LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE s.tenant_id = $1 AND s.status = 'completed'
         AND s.sale_date BETWEEN $2 AND $3`,
      [tenantId, shift.openedAt, endDate]
    );

    const [cashTxns] = await this.transactionsRepository.manager.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0) AS "cashIn",
         COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0) AS "cashOut"
       FROM cash_transactions WHERE shift_id = $1`,
      [shiftId]
    );

    const [expensesRow] = await this.shiftsRepository.manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE shift_id = $1`,
      [shiftId]
    );

    const cash = Number(salesByMethod.cash);
    const card = Number(salesByMethod.card);
    const bankTransfer = Number(salesByMethod.bankTransfer);
    const credit = Number(salesByMethod.credit);
    const expensesTotal = Number(expensesRow.total);
    const cashIn = Number(cashTxns.cashIn);
    const cashOut = Number(cashTxns.cashOut);

    const expectedCashInDrawer =
      Number(shift.openingBalance) + cash + cashIn - cashOut - expensesTotal;

    return {
      shift,
      sales: { cash, card, bankTransfer, credit, total: cash + card + bankTransfer + credit },
      expenses: expensesTotal,
      cashMovements: { cashIn, cashOut },
      remaining: {
        cash: expectedCashInDrawer,
        bankTransfer,
        credit,
      },
    };
  }
}
