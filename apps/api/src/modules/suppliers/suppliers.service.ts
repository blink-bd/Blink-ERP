import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { stripProtected } from '@/common/utils/sanitize';
import { Supplier } from './entities/supplier.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier) private readonly repo: Repository<Supplier>,
    @InjectRepository(SupplierPayment) private readonly paymentsRepo: Repository<SupplierPayment>
  ) {}

  async findAll(tenantId: string, search?: string) {
    const query = this.repo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.deletedAt IS NULL');
    if (search) {
      query.andWhere('(s.name ILIKE :search OR s.phone ILIKE :search)', { search: `%${search}%` });
    }
    const suppliers = await query.orderBy('s.name', 'ASC').getMany();
    const totalOwed = suppliers.reduce((sum, s) => sum + Number(s.balance), 0);
    return { data: suppliers, totalOwed };
  }

  async findById(tenantId: string, id: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    return supplier;
  }

  create(tenantId: string, data: Partial<Supplier>, userId?: string) {
    const clean = stripProtected(data);
    const previousBalance = Number((clean as any).previousBalance) || 0;
    const supplier = this.repo.create({
      ...clean,
      tenantId,
      createdBy: userId,
      previousBalance,
      balance: previousBalance, // الرصيد الحالي يبدأ من الرصيد السابق
    });
    return this.repo.save(supplier);
  }

  async update(tenantId: string, id: string, data: Partial<Supplier> & { openingBalanceReason?: string; updatedBy?: string }) {
    const supplier = await this.findById(tenantId, id);
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
        await this.repo.manager.query(
          `INSERT INTO party_balance_adjustments
             (tenant_id, party_type, supplier_id, amount, balance_before, balance_after, reason, created_by)
           VALUES ($1, 'supplier', $2, $3, $4, $5, $6, $7)`,
          [tenantId, id, delta, before, nextOpening, reason, (data as any).updatedBy || null]
        );
        supplier.balance = Number(supplier.balance) + delta;
      }
      supplier.previousBalance = nextOpening;
    }
    return this.repo.save(supplier);
  }

  async adjustBalance(tenantId: string, id: string, delta: number): Promise<Supplier> {
    const supplier = await this.findById(tenantId, id);
    supplier.balance = Number(supplier.balance) + delta;
    return this.repo.save(supplier);
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
    userId: string | undefined
  ): Promise<{ payment: SupplierPayment; supplier: Supplier }> {
    if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    const supplier = await this.findById(tenantId, supplierId);

    const payment = await this.paymentsRepo.save(
      this.paymentsRepo.create({
        tenantId,
        supplierId,
        amount,
        method,
        notes,
        paymentDate: new Date(),
        createdBy: userId,
      })
    );

    supplier.balance = Number(supplier.balance) - amount;
    await this.repo.save(supplier);

    return { payment, supplier };
  }

  /** كشف حساب المورد: المشتريات (مديونية) + السدادات (دائن). */
  async statement(tenantId: string, supplierId: string) {
    const supplier = await this.findById(tenantId, supplierId);

    const purchases = await this.repo.manager.query(
      `SELECT id, purchase_number AS "referenceNumber", purchase_date AS date, total AS amount, 'purchase' AS type
       FROM purchases WHERE tenant_id = $1 AND supplier_id = $2
       ORDER BY purchase_date ASC`,
      [tenantId, supplierId]
    );

    const payments = await this.paymentsRepo.find({ where: { tenantId, supplierId }, order: { paymentDate: 'ASC' } });
    const adjustments = await this.repo.manager.query(
      `SELECT id, created_at AS date, amount, reason
       FROM party_balance_adjustments
       WHERE tenant_id = $1 AND party_type = 'supplier' AND supplier_id = $2
       ORDER BY created_at ASC`,
      [tenantId, supplierId]
    );

    const entries = [
      ...purchases.map((p: any) => ({
        date: p.date, type: 'purchase', referenceNumber: p.referenceNumber,
        debit: 0, credit: Number(p.amount), description: 'فاتورة مشتريات',
      })),
      ...payments.map((p) => ({
        date: p.paymentDate, type: 'payment', referenceNumber: p.referenceNumber,
        debit: Number(p.amount), credit: 0, description: `سداد (${p.method})`,
      })),
      ...adjustments.map((a: any) => ({
        id: a.id,
        date: a.date,
        type: 'opening_balance_adjustment',
        referenceNumber: '',
        debit: Number(a.amount) < 0 ? Math.abs(Number(a.amount)) : 0,
        credit: Number(a.amount) > 0 ? Number(a.amount) : 0,
        description: `تعديل الرصيد الافتتاحي: ${a.reason}`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const adjustmentTotal = adjustments.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    let running = Number(supplier.previousBalance) - adjustmentTotal;
    const withBalance = entries.map((e) => {
      running = running + e.credit - e.debit;
      return { ...e, balance: running };
    });

    return { supplier, previousBalance: supplier.previousBalance, entries: withBalance, currentBalance: supplier.balance };
  }
}
