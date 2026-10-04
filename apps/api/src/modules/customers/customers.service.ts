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
  async search(tenantId: string, query: string) {
    if (!query || query.length < 2) return [];
    return this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('(c.name ILIKE :q OR c.phone ILIKE :q)', { q: `%${query}%` })
      .limit(10)
      .getMany();
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

  async update(tenantId: string, id: string, data: Partial<Customer>) {
    const customer = await this.findById(tenantId, id);
    Object.assign(customer, stripProtected(data));
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

    const entries = [
      ...sales.map((s: any) => ({ id: s.id, date: s.date, type: 'sale', referenceNumber: s.referenceNumber, debit: Number(s.amount), credit: 0, description: 'فاتورة بيع' })),
      ...payments.map((p: any) => ({ date: p.date, type: 'payment', referenceNumber: p.referenceNumber, debit: 0, credit: Number(p.amount), description: `سداد (${p.method})` })),
      ...returns.map((r: any) => ({ date: r.date, type: 'return', referenceNumber: r.referenceNumber, debit: 0, credit: Number(r.amount), description: 'مرتجع' })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = Number(customer.previousBalance);
    const withBalance = entries.map((e) => {
      running = running + e.debit - e.credit;
      return { ...e, balance: running };
    });

    return { customer, previousBalance: customer.previousBalance, entries: withBalance, currentBalance: customer.balance };
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
      `SELECT COUNT(*)::int AS c FROM payments WHERE tenant_id = $1`, [tenantId]
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
