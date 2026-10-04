import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { stripProtected } from '@/common/utils/sanitize';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  async findAll(tenantId: string, search?: string) {
    const query = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.deletedAt IS NULL');
    if (search) {
      query.andWhere('(c.name ILIKE :search OR c.phone ILIKE :search)', { search: `%${search}%` });
    }
    const customers = await query.orderBy('c.name', 'ASC').getMany();
    const totalOwed = customers.reduce((sum, c) => sum + Number(c.balance), 0);
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

  async findById(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    return customer;
  }

  create(tenantId: string, data: Partial<Customer>, userId?: string) {
    const clean = stripProtected(data);
    const previousBalance = Number((clean as any).previousBalance) || 0;
    const customer = this.repo.create({
      ...clean,
      tenantId,
      createdBy: userId,
      previousBalance,
      balance: previousBalance,
    });
    return this.repo.save(customer);
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<Customer> & { openingBalanceReason?: string; updatedBy?: string }
  ) {
    const customer = await this.findById(tenantId, id);
    const clean = stripProtected(data as any);
    delete (clean as any).previousBalance;
    delete (clean as any).openingBalanceReason;
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
        await this.repo.manager.query(
          `INSERT INTO party_balance_adjustments
             (tenant_id, party_type, customer_id, amount, balance_before, balance_after, reason, created_by)
           VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7)`,
          [tenantId, id, delta, before, nextOpening, reason, (data as any).updatedBy || null]
        );
        customer.balance = Number(customer.balance) + delta;
      }
      customer.previousBalance = nextOpening;
    }
    return this.repo.save(customer);
  }

  async adjustBalance(tenantId: string, id: string, delta: number): Promise<Customer> {
    const customer = await this.findById(tenantId, id);
    customer.balance = Number(customer.balance) + delta;
    return this.repo.save(customer);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const customer = await this.findById(tenantId, id);
    await this.repo.softRemove(customer);
  }

  /** كشف حساب العميل: فواتير البيع (مديونية) + الدفعات (دائن) + المرتجعات (دائن). */
  async statement(tenantId: string, customerId: string) {
    const customer = await this.findById(tenantId, customerId);

    const sales = await this.repo.manager.query(
      `SELECT id, sale_number AS "referenceNumber", sale_date AS date, total AS amount
       FROM sales WHERE tenant_id = $1 AND customer_id = $2 AND status = 'completed'
       ORDER BY sale_date ASC`,
      [tenantId, customerId]
    );
    const payments = await this.repo.manager.query(
      `SELECT p.id, p.reference_number AS "referenceNumber", p.payment_date AS date, p.amount, pm.name_ar AS method
       FROM payments p JOIN payment_methods pm ON pm.id = p.payment_method_id
       WHERE p.tenant_id = $1 AND p.customer_id = $2
       ORDER BY p.payment_date ASC`,
      [tenantId, customerId]
    );
    const returns = await this.repo.manager.query(
      `SELECT id, return_number AS "referenceNumber", return_date AS date, refund_amount AS amount
       FROM sale_returns WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY return_date ASC`,
      [tenantId, customerId]
    );
    const adjustments = await this.repo.manager.query(
      `SELECT id, created_at AS date, amount, balance_before AS "balanceBefore",
              balance_after AS "balanceAfter", reason
       FROM party_balance_adjustments
       WHERE tenant_id = $1 AND party_type = 'customer' AND customer_id = $2
       ORDER BY created_at ASC`,
      [tenantId, customerId]
    );

    const entries = [
      ...sales.map((s: any) => ({
        id: s.id,
        date: s.date,
        type: 'sale',
        referenceNumber: s.referenceNumber,
        debit: Number(s.amount),
        credit: 0,
        description: 'فاتورة بيع',
      })),
      ...payments.map((p: any) => ({
        date: p.date,
        type: 'payment',
        referenceNumber: p.referenceNumber,
        debit: 0,
        credit: Number(p.amount),
        description: `سداد (${p.method})`,
      })),
      ...returns.map((r: any) => ({
        date: r.date,
        type: 'return',
        referenceNumber: r.referenceNumber,
        debit: 0,
        credit: Number(r.amount),
        description: 'مرتجع',
      })),
      ...adjustments.map((a: any) => ({
        id: a.id,
        date: a.date,
        type: 'opening_balance_adjustment',
        referenceNumber: '',
        debit: Number(a.amount) > 0 ? Number(a.amount) : 0,
        credit: Number(a.amount) < 0 ? Math.abs(Number(a.amount)) : 0,
        reason: a.reason,
        description: `تعديل الرصيد الافتتاحي: ${a.reason}`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // previousBalance يحمل آخر قيمة، لذلك نرجع منه مجموع التعديلات حتى يظهر
    // الرصيد الافتتاحي الأصلي ثم كل تعديل كسطر مستقل في الكشف.
    const adjustmentTotal = adjustments.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    let running = Number(customer.previousBalance) - adjustmentTotal;
    const withBalance = entries.map((e) => {
      running = running + e.debit - e.credit;
      return { ...e, balance: running };
    });

    return {
      customer,
      previousBalance: customer.previousBalance,
      entries: withBalance,
      currentBalance: customer.balance,
    };
  }

  /** سداد مبلغ مباشر من العميل (مش مرتبط بفاتورة بعينها). */
  async collectPayment(
    tenantId: string,
    customerId: string,
    amount: number,
    methodId: string,
    notes: string | undefined,
    userId: string
  ) {
    if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    const customer = await this.findById(tenantId, customerId);

    const count = await this.repo.manager.query(
      `SELECT COUNT(*)::int AS c FROM payments WHERE tenant_id = $1`,
      [tenantId]
    );
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(count[0].c + 1).padStart(4, '0')}`;

    await this.repo.manager.query(
      `INSERT INTO payments (tenant_id, payment_number, customer_id, payment_method_id, amount, payment_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)`,
      [tenantId, paymentNumber, customerId, methodId, amount, notes || null, userId]
    );

    customer.balance = Number(customer.balance) - amount;
    return this.repo.save(customer);
  }
}
