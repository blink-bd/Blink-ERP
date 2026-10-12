import { stripProtected } from '@/common/utils/sanitize';
import { resolveTenantBranch } from '@/common/utils/branch-accounting';
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

  async findAll(tenantId: string, startDate?: string, endDate?: string, branchIds?: string[]) {
    const query = this.expensesRepository
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId });
    if (startDate) query.andWhere('e.expenseDate >= :startDate', { startDate });
    if (endDate) query.andWhere('e.expenseDate <= :endDate', { endDate });
    if (branchIds?.length) query.andWhere('e.branchId IN (:...branchIds)', { branchIds });
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

    if (clean.shiftId) {
      const [shift] = await this.expensesRepository.manager.query(
        `SELECT id FROM cash_register_shifts WHERE id = $1 AND tenant_id = $2 AND status = 'open'`,
        [clean.shiftId, tenantId]
      );
      if (!shift) throw new NotFoundException('الوردية غير موجودة لهذا التاجر');
    }

    const branchId = await resolveTenantBranch(
      this.expensesRepository.manager,
      tenantId,
      clean.branchId
    );
    const count = await this.expensesRepository.count({ where: { tenantId } });
    const expense = this.expensesRepository.create({
      ...clean,
      branchId,
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

  async summary(tenantId: string, period: 'day' | 'month' | 'year' = 'day', branchIds?: string[]) {
    const trunc = period === 'year' ? 'year' : period === 'month' ? 'month' : 'day';
    const [row] = await this.expensesRepository.manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE tenant_id = $1 AND status = 'approved'
         AND date_trunc($2, expense_date) = date_trunc($2, CURRENT_DATE)
         AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))`,
      [tenantId, trunc, branchIds?.length ? branchIds : null]
    );
    return { period, total: Number(row.total), count: row.count };
  }
}
