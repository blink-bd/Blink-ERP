import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async salesReport(tenantId: string, startDate: string, endDate: string) {
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
      WHERE tenant_id = $1 AND status = 'completed' AND sale_date BETWEEN $2 AND $3
      `,
      [tenantId, startDate, endDate]
    );

    const breakdown = await this.dataSource.query(
      `
      SELECT
        DATE(sale_date) AS "date",
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(total), 0) AS "totalSales",
        COALESCE(SUM(total - cogs), 0) AS "grossProfit"
      FROM sales
      WHERE tenant_id = $1 AND status = 'completed' AND sale_date BETWEEN $2 AND $3
      GROUP BY DATE(sale_date)
      ORDER BY DATE(sale_date) ASC
      `,
      [tenantId, startDate, endDate]
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
      WHERE si.tenant_id = $1 AND s.sale_date BETWEEN $2 AND $3 AND s.status = 'completed'
      GROUP BY si.product_id, si.product_name
      ORDER BY revenue DESC
      LIMIT 10
      `,
      [tenantId, startDate, endDate]
    );

    return {
      period: { startDate, endDate },
      summary: summary[0],
      breakdown,
      topProducts,
    };
  }

  async inventoryReport(tenantId: string) {
    const summary = await this.dataSource.query(
      `
      SELECT
        COUNT(DISTINCT p.id)::int AS "totalProducts",
        COALESCE(SUM(i.quantity), 0) AS "totalQuantity",
        COALESCE(SUM(i.quantity * i.weighted_avg_cost), 0) AS "totalValue",
        COUNT(*) FILTER (WHERE i.available_quantity <= p.min_stock_level)::int AS "lowStockProducts",
        COUNT(*) FILTER (WHERE i.available_quantity <= 0)::int AS "outOfStockProducts"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = $1
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.track_inventory = true
      `,
      [tenantId]
    );

    return { summary: summary[0] };
  }

  async profitLossReport(tenantId: string, startDate: string, endDate: string) {
    const revenue = await this.dataSource.query(
      `SELECT COALESCE(SUM(total), 0) AS "sales" FROM sales
       WHERE tenant_id = $1 AND status = 'completed' AND sale_date BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    const cogs = await this.dataSource.query(
      `SELECT COALESCE(SUM(cogs), 0) AS "cogs" FROM sales
       WHERE tenant_id = $1 AND status = 'completed' AND sale_date BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    const expenses = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS "expenses" FROM expenses
       WHERE tenant_id = $1 AND status = 'approved' AND expense_date BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    const salesTotal = Number(revenue[0].sales);
    const cogsTotal = Number(cogs[0].cogs);
    const expensesTotal = Number(expenses[0].expenses);
    const grossProfit = salesTotal - cogsTotal;
    const netProfit = grossProfit - expensesTotal;

    return {
      period: { startDate, endDate },
      revenue: { sales: salesTotal, total: salesTotal },
      cogs: cogsTotal,
      grossProfit,
      grossProfitMargin: salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0,
      expenses: { total: expensesTotal },
      netProfit,
      netProfitMargin: salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0,
    };
  }

  async purchasesReport(tenantId: string, startDate: string, endDate: string) {
    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "purchasesCount",
         COALESCE(SUM(total), 0) AS "totalPurchases",
         COALESCE(SUM(paid_amount), 0) AS "totalPaid",
         COALESCE(SUM(total - paid_amount), 0) AS "totalRemaining"
       FROM purchases
       WHERE tenant_id = $1 AND purchase_date BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    const bySupplier = await this.dataSource.query(
      `SELECT s.id AS "supplierId", s.name AS "supplierName",
              COUNT(p.id)::int AS "purchasesCount", COALESCE(SUM(p.total), 0) AS total
       FROM purchases p JOIN suppliers s
         ON s.id = p.supplier_id AND s.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.purchase_date BETWEEN $2 AND $3
       GROUP BY s.id, s.name ORDER BY total DESC LIMIT 10`,
      [tenantId, startDate, endDate]
    );

    return { period: { startDate, endDate }, summary, bySupplier };
  }

  async expensesReport(tenantId: string, startDate: string, endDate: string) {
    const [summary] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS "expensesCount", COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE tenant_id = $1 AND status = 'approved' AND expense_date BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    const byCategory = await this.dataSource.query(
      `SELECT ec.name_ar AS category, COUNT(e.id)::int AS count, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e JOIN expense_categories ec
         ON ec.id = e.category_id AND ec.tenant_id = $1
       WHERE e.tenant_id = $1 AND e.status = 'approved' AND e.expense_date BETWEEN $2 AND $3
       GROUP BY ec.name_ar ORDER BY total DESC`,
      [tenantId, startDate, endDate]
    );

    return { period: { startDate, endDate }, summary, byCategory };
  }
}
