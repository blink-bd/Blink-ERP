import { stripProtected } from '@/common/utils/sanitize';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { ExpenseCategory } from './entities/expense-category.entity';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepository: Repository<ExpenseCategory>
  ) {}

  async findAll(tenantId: string, startDate?: string, endDate?: string) {
    const query = this.expensesRepository
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId });
    if (startDate) query.andWhere('e.expenseDate >= :startDate', { startDate });
    if (endDate) query.andWhere('e.expenseDate <= :endDate', { endDate });
    return query.orderBy('e.expenseDate', 'DESC').getMany();
  }

  async create(tenantId: string, data: Partial<Expense>, userId: string): Promise<Expense> {
    const clean = stripProtected(data);
    if (!clean.categoryId) throw new BadRequestException('فئة المصروف مطلوبة');
    if (!Number.isFinite(Number(clean.amount)) || Number(clean.amount) <= 0) {
      throw new BadRequestException('قيمة المصروف يجب أن تكون أكبر من صفر');
    }

    const [category] = await this.expensesRepository.manager.query(
      `SELECT id FROM expense_categories WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [clean.categoryId, tenantId]
    );
    if (!category) throw new NotFoundException('فئة المصروف غير موجودة لهذا التاجر');

    if (clean.branchId) {
      const [branch] = await this.expensesRepository.manager.query(
        `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [clean.branchId, tenantId]
      );
      if (!branch) throw new NotFoundException('الفرع غير موجود لهذا التاجر');
    }
    if (clean.shiftId) {
      const [shift] = await this.expensesRepository.manager.query(
        `SELECT id FROM cash_register_shifts WHERE id = $1 AND tenant_id = $2 AND status = 'open'`,
        [clean.shiftId, tenantId]
      );
      if (!shift) throw new NotFoundException('الوردية غير موجودة لهذا التاجر');
    }

    const count = await this.expensesRepository.count({ where: { tenantId } });
    const expense = this.expensesRepository.create({
      ...clean,
      tenantId,
      expenseNumber: `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      createdBy: userId,
    });
    return this.expensesRepository.save(expense);
  }

  async findCategories(tenantId: string): Promise<ExpenseCategory[]> {
    return this.categoriesRepository.find({ where: { tenantId, isActive: true } });
  }

  async createCategory(tenantId: string, data: Partial<ExpenseCategory>): Promise<ExpenseCategory> {
    const category = this.categoriesRepository.create({ ...stripProtected(data), tenantId });
    return this.categoriesRepository.save(category);
  }

  /** إجمالي المصروفات اليومي/الشهري/السنوي حسب فترة مختارة. */
  async summary(tenantId: string, period: 'day' | 'month' | 'year' = 'day') {
    const trunc = period === 'year' ? 'year' : period === 'month' ? 'month' : 'day';
    const [row] = await this.expensesRepository.manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE tenant_id = $1 AND status = 'approved'
         AND date_trunc($2, expense_date) = date_trunc($2, CURRENT_DATE)`,
      [tenantId, trunc]
    );
    return { period, total: Number(row.total), count: row.count };
  }
}
