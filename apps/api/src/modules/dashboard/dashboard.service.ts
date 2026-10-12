import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessScope, UNRESTRICTED_SCOPE, sqlIn } from '@/common/utils/access-scope';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** ملخص لوحة التحكم لفرع/مخزن العمل الحالي (أو كل الفروع لو مختار «الكل»). */
  async getSummary(tenantId: string, scope: AccessScope = UNRESTRICTED_SCOPE) {
    const salesParams: any[] = [tenantId];
    const salesBranch = sqlIn('branch_id', scope.branchIds, salesParams);
    const expParams: any[] = [tenantId];
    const expBranch = sqlIn('branch_id', scope.branchIds, expParams);
    const stockParams: any[] = [tenantId];
    const stockWarehouse = sqlIn('i.warehouse_id', scope.warehouseIds, stockParams);

    const [salesToday] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "invoicesCount",
         COALESCE(SUM(total), 0) AS "totalSales",
         COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) AS "cashSalesTotal"
       FROM sales
       WHERE tenant_id = $1 AND status = 'completed' AND sale_date::date = CURRENT_DATE${salesBranch}`,
      salesParams
    );

    // مرتجعات اليوم (بتاريخ المرتجع) بتنزل من مبيعات اليوم.
    const retParams: any[] = [tenantId];
    const retBranch = sqlIn('branch_id', scope.branchIds, retParams);
    const [returnsToday] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(refund_paid), 0) AS refunded
       FROM sale_returns
       WHERE tenant_id = $1 AND return_date::date = CURRENT_DATE${retBranch}`,
      retParams
    );

    const [expensesToday] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM expenses WHERE tenant_id = $1 AND expense_date::date = CURRENT_DATE${expBranch}`,
      expParams
    );

    const lowStock = await this.dataSource.query(
      `SELECT p.id, p.name, p.sku, p.min_stock_level AS "minStockLevel",
              COALESCE(SUM(i.available_quantity), 0) AS "availableQuantity"
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id${stockWarehouse}
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.track_inventory = true AND p.is_active = true
       GROUP BY p.id
       HAVING COALESCE(SUM(i.available_quantity), 0) <= p.min_stock_level
       ORDER BY "availableQuantity" ASC
       LIMIT 20`,
      stockParams
    );

    // أرصدة العملاء/الموردين: لو شغال على فروع معينة نجمع الأرصدة الخاصة بالفروع دي
    // (branch_party_balances)، غير كده الرصيد الإجمالي للعميل/المورد.
    const partyAgg = async (partyType: 'customer' | 'supplier') => {
      if (scope.branchIds) {
        const [row] = await this.dataSource.query(
          `SELECT COUNT(*) FILTER (WHERE x.balance > 0)::int AS "invoicesCount",
                  COALESCE(SUM(x.balance) FILTER (WHERE x.balance > 0), 0) AS "totalOwed"
           FROM (
             SELECT bpb.party_id, SUM(bpb.balance) AS balance
             FROM branch_party_balances bpb
             WHERE bpb.tenant_id = $1 AND bpb.party_type = $2
               AND bpb.branch_id = ANY($3::uuid[])
             GROUP BY bpb.party_id
           ) x`,
          [tenantId, partyType, scope.branchIds]
        );
        return row;
      }
      const table = partyType === 'customer' ? 'customers' : 'suppliers';
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*) FILTER (WHERE balance > 0)::int AS "invoicesCount",
                COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS "totalOwed"
         FROM ${table} WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      );
      return row;
    };
    const customersAgg = await partyAgg('customer');
    const suppliersAgg = await partyAgg('supplier');

    return {
      salesToday: {
        invoicesCount: salesToday.invoicesCount,
        totalSales: Number(salesToday.totalSales),
        returnsTotal: Number(returnsToday.total),
        netSales: Number(salesToday.totalSales) - Number(returnsToday.total),
      },
      returnsToday: {
        count: returnsToday.count,
        total: Number(returnsToday.total),
        refunded: Number(returnsToday.refunded),
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
