import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { normalizeInclusiveDateRange } from '@/common/utils/date-range';

interface BranchOptions {
  branchIds?: string[];
  /** الفروع المسموحة للمستخدم (null/undefined = الكل) — فلتر إضافي مش شرط وجود. */
  restrictToBranchIds?: string[] | null;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class BranchAnalyticsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async report(tenantId: string, options: BranchOptions = {}) {
    const range = normalizeInclusiveDateRange(options.startDate, options.endDate);
    const branches = await this.dataSource.query(
      `SELECT id, name, code, is_main AS "isMain"
       FROM branches
       WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true
         AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
         AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
       ORDER BY is_main DESC, name ASC`,
      [
        tenantId,
        options.branchIds?.length ? options.branchIds : null,
        options.restrictToBranchIds ?? null,
      ]
    );
    if (options.branchIds?.length && branches.length !== new Set(options.branchIds).size) {
      throw new NotFoundException('أحد الفروع المحددة غير موجود أو غير نشط');
    }

    const branchIds = branches.map((branch: any) => branch.id);
    if (!branchIds.length)
      return {
        period: this.period({ ...options, ...range }),
        summary: this.emptySummary(),
        branches: [],
        details: this.emptyDetails(),
      };
    const startDate = range.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const endDate = range.endDate || new Date().toISOString();
    const params = [tenantId, branchIds, startDate, endDate];

    const [sales, purchases, expenses, returns, maintenance, balances, inventory] =
      await Promise.all([
        this.dataSource.query(
          `SELECT branch_id AS "branchId", COUNT(*)::int AS count,
                COALESCE(SUM(total), 0) AS total, COALESCE(SUM(paid_amount), 0) AS paid,
                COALESCE(SUM(cogs), 0) AS cogs, COALESCE(SUM(discount_amount), 0) AS discounts
         FROM sales WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND status = 'completed'
           AND sale_date >= $3 AND sale_date <= $4
         GROUP BY branch_id`,
          params
        ),
        this.dataSource.query(
          `SELECT branch_id AS "branchId", COUNT(*)::int AS count,
                COALESCE(SUM(total), 0) AS total, COALESCE(SUM(paid_amount), 0) AS paid
         FROM purchases WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])
           AND purchase_date >= $3 AND purchase_date <= $4
         GROUP BY branch_id`,
          params
        ),
        this.dataSource.query(
          `SELECT branch_id AS "branchId", COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
         FROM expenses WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND status = 'approved'
           AND expense_date >= $3 AND expense_date <= $4
         GROUP BY branch_id`,
          params
        ),
        this.dataSource.query(
          // تكلفة البضاعة المرتجعة بتتعكس من وقت تسجيل المرتجع (زي تقرير الأرباح).
          `SELECT branch_id AS "branchId", COUNT(*)::int AS count,
                COALESCE(SUM(total), 0) AS total,
                COALESCE(SUM(cogs_adjustment), 0) AS "cogsAdjustment",
                COALESCE(SUM(refund_paid), 0) AS refunded
         FROM sale_returns
         WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])
           AND return_date >= $3 AND return_date <= $4
         GROUP BY branch_id`,
          params
        ),
        this.dataSource.query(
          `SELECT branch_id AS "branchId", COUNT(*)::int AS count,
                COALESCE(SUM(service_price), 0) AS revenue,
                COALESCE(SUM(parts_cost), 0) AS "partsCost",
                COALESCE(SUM(profit), 0) AS profit
         FROM maintenance_invoices
         WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND status = 'completed'
           AND maintenance_date >= $3 AND maintenance_date <= $4
         GROUP BY branch_id`,
          params
        ),
        this.dataSource.query(
          `SELECT branch_id AS "branchId",
                COUNT(*) FILTER (WHERE party_type = 'customer')::int AS "customerCount",
                COALESCE(SUM(balance) FILTER (WHERE party_type = 'customer'), 0) AS receivables,
                COUNT(*) FILTER (WHERE party_type = 'supplier')::int AS "supplierCount",
                COALESCE(SUM(balance) FILTER (WHERE party_type = 'supplier'), 0) AS payables
         FROM branch_party_balances
         WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])
         GROUP BY branch_id`,
          [tenantId, branchIds]
        ),
        this.dataSource.query(
          `SELECT w.branch_id AS "branchId", COUNT(DISTINCT p.id)::int AS "productCount",
                COALESCE(SUM(i.quantity), 0) AS "stockQuantity",
                COALESCE(SUM(i.quantity * i.weighted_avg_cost), 0) AS "stockValue"
         FROM warehouses w
         JOIN inventory i ON i.warehouse_id = w.id AND i.tenant_id = w.tenant_id
         JOIN products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
         WHERE w.tenant_id = $1 AND w.branch_id = ANY($2::uuid[]) AND w.deleted_at IS NULL
           AND p.deleted_at IS NULL AND p.track_inventory = true
         GROUP BY w.branch_id`,
          [tenantId, branchIds]
        ),
      ]);

    const indexByBranch = (rows: any[]) => new Map(rows.map((row) => [row.branchId, row]));
    const salesMap = indexByBranch(sales);
    const purchasesMap = indexByBranch(purchases);
    const expensesMap = indexByBranch(expenses);
    const returnsMap = indexByBranch(returns);
    const maintenanceMap = indexByBranch(maintenance);
    const balancesMap = indexByBranch(balances);
    const inventoryMap = indexByBranch(inventory);

    const byBranch = branches.map((branch: any) => {
      const s = salesMap.get(branch.id) || {};
      const p = purchasesMap.get(branch.id) || {};
      const e = expensesMap.get(branch.id) || {};
      const r = returnsMap.get(branch.id) || {};
      const m = maintenanceMap.get(branch.id) || {};
      const b = balancesMap.get(branch.id) || {};
      const i = inventoryMap.get(branch.id) || {};
      const revenue = Number(s.total || 0);
      const cogs = Math.max(0, Number(s.cogs || 0) - Number(r.cogsAdjustment || 0));
      const returnsTotal = Number(r.total || 0);
      const maintenanceProfit = Number(m.profit || 0);
      const expenseTotal = Number(e.total || 0);
      return {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        isMain: branch.isMain,
        sales: { count: Number(s.count || 0), total: revenue, paid: Number(s.paid || 0) },
        purchases: {
          count: Number(p.count || 0),
          total: Number(p.total || 0),
          paid: Number(p.paid || 0),
        },
        expenses: { count: Number(e.count || 0), total: expenseTotal },
        returns: {
          count: Number(r.count || 0),
          total: returnsTotal,
          refunded: Number(r.refunded || 0),
        },
        maintenance: {
          count: Number(m.count || 0),
          revenue: Number(m.revenue || 0),
          partsCost: Number(m.partsCost || 0),
          profit: maintenanceProfit,
        },
        profit: {
          cogs,
          gross: revenue - returnsTotal - cogs + maintenanceProfit,
          net: revenue - returnsTotal - cogs + maintenanceProfit - expenseTotal,
        },
        accounts: {
          customers: Number(b.customerCount || 0),
          receivables: Number(b.receivables || 0),
          suppliers: Number(b.supplierCount || 0),
          payables: Number(b.payables || 0),
        },
        inventory: {
          productCount: Number(i.productCount || 0),
          quantity: Number(i.stockQuantity || 0),
          value: Number(i.stockValue || 0),
        },
      };
    });

    const details = await this.loadDetails(tenantId, branchIds, startDate, endDate);
    const summary = byBranch.reduce((total: any, branch: any) => {
      total.salesCount += branch.sales.count;
      total.sales += branch.sales.total;
      total.salesPaid += branch.sales.paid;
      total.purchaseCount += branch.purchases.count;
      total.purchases += branch.purchases.total;
      total.purchasesPaid += branch.purchases.paid;
      total.expenseCount += branch.expenses.count;
      total.expenses += branch.expenses.total;
      total.returnCount += branch.returns.count;
      total.returns += branch.returns.total;
      total.maintenanceCount += branch.maintenance.count;
      total.maintenanceRevenue += branch.maintenance.revenue;
      total.maintenancePartsCost += branch.maintenance.partsCost;
      total.maintenanceProfit += branch.maintenance.profit;
      total.cogs += branch.profit.cogs;
      total.grossProfit += branch.profit.gross;
      total.netProfit += branch.profit.net;
      total.receivables += branch.accounts.receivables;
      total.payables += branch.accounts.payables;
      total.customerCount += branch.accounts.customers;
      total.supplierCount += branch.accounts.suppliers;
      total.inventoryProducts += branch.inventory.productCount;
      total.inventoryQuantity += branch.inventory.quantity;
      total.inventoryValue += branch.inventory.value;
      return total;
    }, this.emptySummary());

    return { period: { startDate, endDate }, summary, branches: byBranch, details };
  }

  private async loadDetails(
    tenantId: string,
    branchIds: string[],
    startDate: string,
    endDate: string
  ) {
    const params = [tenantId, branchIds, startDate, endDate];
    const [sales, purchases, expenses, returns, maintenance, customers, suppliers] =
      await Promise.all([
        this.dataSource.query(
          `SELECT s.id, s.branch_id AS "branchId", b.name AS "branchName", s.sale_number AS number,
                s.sale_date AS date, s.total, s.paid_amount AS "paidAmount", s.payment_status AS "paymentStatus",
                c.name AS "customerName"
         FROM sales s JOIN branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
         LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.branch_id = ANY($2::uuid[]) AND s.status = 'completed'
           AND s.sale_date >= $3 AND s.sale_date <= $4 ORDER BY s.sale_date DESC LIMIT 100`,
          params
        ),
        this.dataSource.query(
          `SELECT p.id, p.branch_id AS "branchId", b.name AS "branchName", p.purchase_number AS number,
                p.purchase_date AS date, p.total, p.paid_amount AS "paidAmount", s.name AS "supplierName"
         FROM purchases p JOIN branches b ON b.id = p.branch_id AND b.tenant_id = p.tenant_id
         JOIN suppliers s ON s.id = p.supplier_id AND s.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.branch_id = ANY($2::uuid[])
           AND p.purchase_date >= $3 AND p.purchase_date <= $4
         ORDER BY p.purchase_date DESC LIMIT 100`,
          params
        ),
        this.dataSource.query(
          `SELECT e.id, e.branch_id AS "branchId", b.name AS "branchName", e.expense_number AS number,
                e.expense_date AS date, e.amount, e.description
         FROM expenses e JOIN branches b ON b.id = e.branch_id AND b.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1 AND e.branch_id = ANY($2::uuid[]) AND e.status = 'approved'
           AND e.expense_date >= $3 AND e.expense_date <= $4
         ORDER BY e.expense_date DESC LIMIT 100`,
          params
        ),
        this.dataSource.query(
          `SELECT sr.id, sr.branch_id AS "branchId", b.name AS "branchName",
                sr.return_number AS number, sr.return_date AS date, sr.total,
                sr.status, sr.reason, s.sale_number AS "originalSaleNumber",
                sr.invoice_credit AS "invoiceCredit", sr.refund_paid AS "refundPaid",
                sr.account_credit AS "accountCredit"
         FROM sale_returns sr
         JOIN branches b ON b.id = sr.branch_id AND b.tenant_id = sr.tenant_id
         JOIN sales s ON s.id = sr.original_sale_id AND s.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1 AND sr.branch_id = ANY($2::uuid[])
           AND sr.return_date >= $3 AND sr.return_date <= $4
         ORDER BY sr.return_date DESC LIMIT 100`,
          params
        ),
        this.dataSource.query(
          `SELECT m.id, m.branch_id AS "branchId", b.name AS "branchName",
                m.invoice_number AS number, m.maintenance_date AS date, m.customer_name AS "customerName",
                m.product_name AS "productName", m.maintenance_description AS description,
                m.service_price AS "servicePrice", m.parts_cost AS "partsCost", m.profit, m.source
         FROM maintenance_invoices m
         JOIN branches b ON b.id = m.branch_id AND b.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1 AND m.branch_id = ANY($2::uuid[]) AND m.status = 'completed'
           AND m.maintenance_date >= $3 AND m.maintenance_date <= $4
         ORDER BY m.maintenance_date DESC LIMIT 100`,
          params
        ),
        this.dataSource.query(
          `SELECT bpb.branch_id AS "branchId", b.name AS "branchName", c.id, c.name, c.phone,
                bpb.balance, c.is_active AS "isActive"
         FROM branch_party_balances bpb
         JOIN branches b ON b.id = bpb.branch_id AND b.tenant_id = bpb.tenant_id
         JOIN customers c ON c.id = bpb.party_id AND c.tenant_id = bpb.tenant_id
         WHERE bpb.tenant_id = $1 AND bpb.party_type = 'customer' AND bpb.branch_id = ANY($2::uuid[])
           AND c.deleted_at IS NULL
         ORDER BY bpb.balance DESC LIMIT 200`,
          [tenantId, branchIds]
        ),
        this.dataSource.query(
          `SELECT bpb.branch_id AS "branchId", b.name AS "branchName", s.id, s.name, s.phone,
                bpb.balance, s.is_active AS "isActive"
         FROM branch_party_balances bpb
         JOIN branches b ON b.id = bpb.branch_id AND b.tenant_id = bpb.tenant_id
         JOIN suppliers s ON s.id = bpb.party_id AND s.tenant_id = bpb.tenant_id
         WHERE bpb.tenant_id = $1 AND bpb.party_type = 'supplier' AND bpb.branch_id = ANY($2::uuid[])
           AND s.deleted_at IS NULL
         ORDER BY bpb.balance DESC LIMIT 200`,
          [tenantId, branchIds]
        ),
      ]);
    return { sales, purchases, expenses, returns, maintenance, customers, suppliers };
  }

  private period(options: BranchOptions) {
    return {
      startDate: options.startDate || new Date(Date.now() - 30 * 86400000).toISOString(),
      endDate: options.endDate || new Date().toISOString(),
    };
  }

  private emptySummary() {
    return {
      salesCount: 0,
      sales: 0,
      salesPaid: 0,
      purchaseCount: 0,
      purchases: 0,
      purchasesPaid: 0,
      expenseCount: 0,
      expenses: 0,
      returnCount: 0,
      returns: 0,
      maintenanceCount: 0,
      maintenanceRevenue: 0,
      maintenancePartsCost: 0,
      maintenanceProfit: 0,
      cogs: 0,
      grossProfit: 0,
      netProfit: 0,
      receivables: 0,
      payables: 0,
      customerCount: 0,
      supplierCount: 0,
      inventoryProducts: 0,
      inventoryQuantity: 0,
      inventoryValue: 0,
    };
  }

  private emptyDetails() {
    return {
      sales: [],
      purchases: [],
      expenses: [],
      returns: [],
      maintenance: [],
      customers: [],
      suppliers: [],
    };
  }
}
