import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary(tenantId: string) {
    const [salesToday] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "invoicesCount",
         COALESCE(SUM(total), 0) AS "totalSales",
         COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) AS "cashSalesTotal"
       FROM sales
       WHERE tenant_id = $1 AND status = 'completed' AND sale_date::date = CURRENT_DATE`,
      [tenantId]
    );

    const [expensesToday] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM expenses WHERE tenant_id = $1 AND expense_date::date = CURRENT_DATE`,
      [tenantId]
    );

    const lowStock = await this.dataSource.query(
      `SELECT p.id, p.name, p.sku, p.min_stock_level AS "minStockLevel",
              COALESCE(SUM(i.available_quantity), 0) AS "availableQuantity"
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.track_inventory = true AND p.is_active = true
       GROUP BY p.id
       HAVING COALESCE(SUM(i.available_quantity), 0) <= p.min_stock_level
       ORDER BY "availableQuantity" ASC
       LIMIT 20`,
      [tenantId]
    );

    const [customersAgg] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE balance > 0)::int AS "invoicesCount",
              COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS "totalOwed"
       FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    const [suppliersAgg] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE balance > 0)::int AS "invoicesCount",
              COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS "totalOwed"
       FROM suppliers WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    return {
      salesToday: {
        invoicesCount: salesToday.invoicesCount,
        totalSales: Number(salesToday.totalSales),
      },
      expensesToday: {
        count: expensesToday.count,
        total: Number(expensesToday.total),
      },
      lowStockAlerts: lowStock.map((r: any) => ({
        ...r,
        availableQuantity: Number(r.availableQuantity),
        status: Number(r.availableQuantity) <= 0 ? 'out_of_stock' : 'low_stock',
      })),
      customerInvoices: {
        count: customersAgg.invoicesCount,
        totalOwed: Number(customersAgg.totalOwed),
      },
      supplierInvoices: {
        count: suppliersAgg.invoicesCount,
        totalOwed: Number(suppliersAgg.totalOwed),
      },
    };
  }
}
