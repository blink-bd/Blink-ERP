import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseRange } from './advanced-reports.service';
import { AccessScope, UNRESTRICTED_SCOPE, sqlIn } from '@/common/utils/access-scope';

/** شرط فلترة فرع/مخزن العمل لجدول فيه branch_id (وwarehouse_id اختياري). */
function scopeClause(scope: AccessScope, params: any[], alias = '', withWarehouse = true): string {
  const a = alias ? `${alias}.` : '';
  return (
    sqlIn(`${a}branch_id`, scope.branchIds, params) +
    (withWarehouse ? sqlIn(`${a}warehouse_id`, scope.warehouseIds, params) : '')
  );
}

/** التقارير البسيطة (مبيعات/مشتريات/مصروفات) مكانش ليها حد أقصى للمدة. */
const OPEN_RANGE_DAYS = Number.POSITIVE_INFINITY;

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async salesReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    scope: AccessScope = UNRESTRICTED_SCOPE
  ) {
    // نهاية الفترة شاملة اليوم كله (BETWEEN على تاريخ بس كان بيستبعد آخر يوم).
    const range = parseRange(startDate, endDate, OPEN_RANGE_DAYS);
    const base = [tenantId, range.fromTs, range.toExclusiveTs];
    const p1: any[] = [...base];
    const c1 = scopeClause(scope, p1);
    const p2: any[] = [...base];
    const c2 = scopeClause(scope, p2);
    const p3: any[] = [...base];
    const c3 = scopeClause(scope, p3, 's');
    const p4: any[] = [...base];
    const c4 = scopeClause(scope, p4);
    const p5: any[] = [...base];
    const c5 = scopeClause(scope, p5);
    const summary = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(total), 0) AS "totalSales",
        COALESCE(SUM(cogs), 0) AS "totalCost",
        COALESCE(SUM(total - cogs), 0) AS "grossProfit",
        COALESCE(SUM(discount_amount), 0) AS "totalDiscount",
        COALESCE(SUM(tax_amount), 0) AS "totalTax"
      FROM sales
      WHERE tenant_id = $1 AND status = 'completed' AND sale_date >= $2 AND sale_date < $3${c1}
      `,
      p1
    );

    const breakdown = await this.dataSource.query(
      `
      SELECT
        DATE(sale_date) AS "date",
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(total), 0) AS "totalSales",
        COALESCE(SUM(total - cogs), 0) AS "grossProfit"
      FROM sales
      WHERE tenant_id = $1 AND status = 'completed' AND sale_date >= $2 AND sale_date < $3${c2}
      GROUP BY DATE(sale_date)
      ORDER BY DATE(sale_date) ASC
      `,
      p2
    );

    const topProducts = await this.dataSource.query(
      `
      SELECT
        si.product_id AS "productId",
        si.product_name AS "productName",
        SUM(si.quantity) AS "quantitySold",
        SUM(si.total) AS "revenue",
        SUM(si.total - si.total_cost) AS "profit"
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.tenant_id = $1
      WHERE si.tenant_id = $1 AND s.sale_date >= $2 AND s.sale_date < $3 AND s.status = 'completed'${c3}
      GROUP BY si.product_id, si.product_name
      ORDER BY revenue DESC
      LIMIT 10
      `,
      p3
    );

    // المرتجعات بتاريخ تسجيلها بتنزل من المبيعات والربح (إجمالي ويومي).
    const [returns] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS "count", COALESCE(SUM(total), 0) AS "total",
              COALESCE(SUM(cogs_adjustment), 0) AS "cost"
       FROM sale_returns WHERE tenant_id = $1 AND return_date >= $2 AND return_date < $3${c4}`,
      p4
    );
    const returnsByDay = await this.dataSource.query(
      `SELECT TO_CHAR(DATE(return_date), 'YYYY-MM-DD') AS "date", COALESCE(SUM(total), 0) AS "total",
              COALESCE(SUM(cogs_adjustment), 0) AS "cost"
       FROM sale_returns WHERE tenant_id = $1 AND return_date >= $2 AND return_date < $3${c5}
       GROUP BY DATE(return_date)`,
      p5
    );
    const dayKey = (d: any) =>
      d instanceof Date
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : String(d).slice(0, 10);
    const returnsMap = new Map<string, any>(returnsByDay.map((r: any) => [r.date, r]));
    const days = new Map<string, any>();
    for (const row of breakdown) {
      days.set(dayKey(row.date), {
        ...row,
        date: dayKey(row.date),
        returnsTotal: 0,
        netSales: Number(row.totalSales),
        grossProfit: Number(row.grossProfit),
      });
    }
    for (const [date, r] of returnsMap) {
      const day = days.get(date) || {
        date,
        salesCount: 0,
        totalSales: 0,
        returnsTotal: 0,
        netSales: 0,
        grossProfit: 0,
      };
      day.returnsTotal = Number(r.total);
      day.netSales = Number(day.totalSales) - Number(r.total);
      day.grossProfit = Number(day.grossProfit) - (Number(r.total) - Number(r.cost));
      days.set(date, day);
    }
    const s0 = summary[0];
    const returnsTotal = Number(returns.total);
    const returnsCost = Number(returns.cost);
    return {
      period: { startDate: range.from, endDate: range.to },
      summary: {
        ...s0,
        grossSales: Number(s0.totalSales),
        returnsCount: returns.count,
        returnsTotal,
        // صافي بعد المرتجعات
        totalSales: Number(s0.totalSales) - returnsTotal,
        totalCost: Number(s0.totalCost) - returnsCost,
        grossProfit: Number(s0.grossProfit) - (returnsTotal - returnsCost),
      },
      breakdown: Array.from(days.values()).sort((a, b) =>
        dayKey(a.date).localeCompare(dayKey(b.date))
      ),
      topProducts,
    };
  }

  async inventoryReport(tenantId: string, scope: AccessScope = UNRESTRICTED_SCOPE) {
    const params: any[] = [tenantId];
    const wh = sqlIn('i.warehouse_id', scope.warehouseIds, params);
    const summary = await this.dataSource.query(
      `
      SELECT
        COUNT(DISTINCT p.id)::int AS "totalProducts",
        COALESCE(SUM(i.quantity), 0) AS "totalQuantity",
        COALESCE(SUM(i.quantity * i.weighted_avg_cost), 0) AS "totalValue",
        COUNT(*) FILTER (WHERE i.available_quantity <= p.min_stock_level)::int AS "lowStockProducts",
        COUNT(*) FILTER (WHERE i.available_quantity <= 0)::int AS "outOfStockProducts"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = $1${wh}
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.track_inventory = true
      `,
      params
    );

    return { summary: summary[0] };
  }

  /**
   * الأرباح والخسائر. الفاتورة الأصلية مش بتتعدل وقت المرتجع (المرتجع إشعار دائن مستقل)،
   * فالمرتجعات بتتخصم هنا بتاريخ تسجيلها: صافي المبيعات = الفواتير − المرتجعات،
   * والتكلفة = تكلفة الفواتير − تكلفة البضاعة المرتجعة. وبيتضاف ربح الصيانة (شامل صيانة
   * المرتجعات بالسالب). التواريخ: من بداية startDate لحد نهاية endDate.
   */
  async profitLossReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    scope: AccessScope = UNRESTRICTED_SCOPE
  ) {
    const range = parseRange(startDate, endDate);
    const base = [tenantId, range.fromTs, range.toExclusiveTs];
    const salesParams: any[] = [...base];
    const salesScope = scopeClause(scope, salesParams);
    const returnParams: any[] = [...base];
    const returnScope = scopeClause(scope, returnParams);
    const expenseParams: any[] = [...base];
    const expenseScope = scopeClause(scope, expenseParams, 'e', false);
    const maintenanceParams: any[] = [...base];
    const maintenanceScope = scopeClause(scope, maintenanceParams, '', false);
    const [sales] = await this.dataSource.query(
      `SELECT COALESCE(SUM(total), 0) AS "sales", COALESCE(SUM(cogs), 0) AS "cogs",
              COALESCE(SUM(discount_amount), 0) AS "discounts", COUNT(*)::int AS "count"
       FROM sales
       WHERE tenant_id = $1 AND status IN ('completed', 'returned') AND sale_date >= $2 AND sale_date < $3${salesScope}`,
      salesParams
    );
    const [returns] = await this.dataSource.query(
      `SELECT COALESCE(SUM(total), 0) AS "total", COALESCE(SUM(cogs_adjustment), 0) AS "cogs"
       FROM sale_returns
       WHERE tenant_id = $1 AND return_date >= $2 AND return_date < $3${returnScope}`,
      returnParams
    );
    const [maintenance] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS "count", COALESCE(SUM(service_price), 0) AS "revenue",
              COALESCE(SUM(parts_cost), 0) AS "partsCost", COALESCE(SUM(profit), 0) AS "profit",
              COUNT(*) FILTER (WHERE source = 'sale_return')::int AS "returnRepairs",
              COALESCE(SUM(parts_cost) FILTER (WHERE source = 'sale_return'), 0) AS "returnRepairsCost"
       FROM maintenance_invoices
       WHERE tenant_id = $1 AND status = 'completed'
         AND maintenance_date >= $2 AND maintenance_date < $3${maintenanceScope}`,
      maintenanceParams
    );
    const expensesByCategory = await this.dataSource.query(
      `SELECT COALESCE(ec.name, 'أخرى') AS "category", COALESCE(SUM(e.amount), 0) AS "total"
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id AND ec.tenant_id = $1
       WHERE e.tenant_id = $1 AND e.status = 'approved' AND e.expense_date >= $2 AND e.expense_date < $3${expenseScope}
       GROUP BY ec.name ORDER BY 2 DESC`,
      expenseParams
    );

    const grossSales = Number(sales.sales);
    const returnsTotal = Number(returns.total);
    const salesTotal = grossSales - returnsTotal;
    const grossCogs = Number(sales.cogs);
    const returnsCogs = Number(returns.cogs);
    const cogsTotal = grossCogs - returnsCogs;
    const expensesTotal = expensesByCategory.reduce((s: number, r: any) => s + Number(r.total), 0);
    const grossProfit = salesTotal - cogsTotal;
    const maintenanceProfit = Number(maintenance.profit);
    const netProfit = grossProfit + maintenanceProfit - expensesTotal;

    return {
      period: { startDate: range.from, endDate: range.to },
      revenue: {
        grossSales,
        returns: returnsTotal,
        discounts: Number(sales.discounts),
        sales: salesTotal,
        total: salesTotal,
        invoices: sales.count,
      },
      cogs: cogsTotal,
      cogsDetails: { sales: grossCogs, returns: returnsCogs },
      maintenance: {
        count: maintenance.count,
        revenue: Number(maintenance.revenue),
        partsCost: Number(maintenance.partsCost),
        profit: maintenanceProfit,
        returnRepairs: maintenance.returnRepairs,
        returnRepairsCost: Number(maintenance.returnRepairsCost),
      },
      grossProfit,
      grossProfitMargin: salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0,
      expenses: {
        total: expensesTotal,
        byCategory: expensesByCategory.map((r: any) => ({
          category: r.category,
          total: Number(r.total),
        })),
      },
      netProfit,
      netProfitMargin: salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0,
    };
  }

  async purchasesReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    scope: AccessScope = UNRESTRICTED_SCOPE
  ) {
    const range = parseRange(startDate, endDate, OPEN_RANGE_DAYS);
    const p1: any[] = [tenantId, range.fromTs, range.toExclusiveTs];
    const c1 = scopeClause(scope, p1);
    const p2: any[] = [tenantId, range.fromTs, range.toExclusiveTs];
    const c2 = scopeClause(scope, p2, 'p');
    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "purchasesCount",
         COALESCE(SUM(total), 0) AS "totalPurchases",
         COALESCE(SUM(paid_amount), 0) AS "totalPaid",
         COALESCE(SUM(total - paid_amount), 0) AS "totalRemaining"
       FROM purchases
       WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date < $3${c1}`,
      p1
    );

    const bySupplier = await this.dataSource.query(
      `SELECT s.id AS "supplierId", s.name AS "supplierName",
              COUNT(p.id)::int AS "purchasesCount", COALESCE(SUM(p.total), 0) AS total
       FROM purchases p JOIN suppliers s
         ON s.id = p.supplier_id AND s.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.purchase_date >= $2 AND purchase_date < $3${c2}
       GROUP BY s.id, s.name ORDER BY total DESC LIMIT 10`,
      p2
    );

    return { period: { startDate: range.from, endDate: range.to }, summary, bySupplier };
  }

  async expensesReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    scope: AccessScope = UNRESTRICTED_SCOPE
  ) {
    const range = parseRange(startDate, endDate, OPEN_RANGE_DAYS);
    const p1: any[] = [tenantId, range.fromTs, range.toExclusiveTs];
    const c1 = scopeClause(scope, p1, '', false);
    const p2: any[] = [tenantId, range.fromTs, range.toExclusiveTs];
    const c2 = scopeClause(scope, p2, 'e', false);
    const [summary] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS "expensesCount", COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE tenant_id = $1 AND status = 'approved' AND expense_date >= $2 AND expense_date < $3${c1}`,
      p1
    );

    const byCategory = await this.dataSource.query(
      `SELECT ec.name_ar AS category, COUNT(e.id)::int AS count, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e JOIN expense_categories ec
         ON ec.id = e.category_id AND ec.tenant_id = $1
       WHERE e.tenant_id = $1 AND e.status = 'approved' AND e.expense_date >= $2 AND expense_date < $3${c2}
       GROUP BY ec.name_ar ORDER BY total DESC`,
      p2
    );

    return { period: { startDate: range.from, endDate: range.to }, summary, byCategory };
  }
}
