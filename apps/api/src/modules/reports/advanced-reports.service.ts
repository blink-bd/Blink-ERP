import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DateRange {
  from: string; // inclusive (YYYY-MM-DD)
  to: string; // inclusive (YYYY-MM-DD)
  fromTs: string;
  toExclusiveTs: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** يحوّل startDate/endDate لنطاق [from, to+1day) عشان آخر يوم يتحسب كامل. */
export function parseRange(startDate?: string, endDate?: string, maxDays = 731): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  const to = endDate && DATE_RE.test(endDate) ? endDate : today;
  const defaultFrom = new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
  const from = startDate && DATE_RE.test(startDate) ? startDate : defaultFrom;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs))
    throw new BadRequestException('تاريخ غير صحيح');
  if (fromMs > toMs) throw new BadRequestException('تاريخ البداية بعد تاريخ النهاية');
  if ((toMs - fromMs) / 86400000 > maxDays) {
    throw new BadRequestException(`أقصى مدة للتقرير ${maxDays} يوم`);
  }
  return {
    from,
    to,
    fromTs: `${from} 00:00:00`,
    toExclusiveTs: new Date(toMs + 86400000).toISOString().slice(0, 10) + ' 00:00:00',
  };
}

const n = (v: unknown) => Number(v) || 0;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * التقارير المتقدمة (ميزة advanced_reports). كلها:
 * - مقيدة بالتاجر (tenant_id) في كل جدول في الاستعلام
 * - صافية بعد المرتجعات (المبيعات الملغاة مستبعدة)
 */
@Injectable()
export class AdvancedReportsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** ربحية المنتجات: الكمية والإيراد والتكلفة والربح والهامش (صافي بعد المرتجعات). */
  async productProfitability(tenantId: string, range: DateRange, limit = 200) {
    const rows = await this.db.query(
      `
      WITH sold AS (
        SELECT si.product_id, MAX(si.product_name) AS name,
               SUM(si.quantity) AS qty, SUM(si.total) AS revenue, SUM(si.quantity * si.unit_cost) AS cost
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.tenant_id = $1
        WHERE si.tenant_id = $1 AND s.status IN ('completed', 'returned')
          AND s.sale_date >= $2 AND s.sale_date < $3
        GROUP BY si.product_id
      ),
      returned AS (
        SELECT ri.product_id, SUM(ri.quantity) AS qty, SUM(ri.total) AS revenue,
               SUM(ri.quantity * ri.unit_cost) AS cost
        FROM sale_return_items ri
        JOIN sale_returns r ON r.id = ri.return_id AND r.tenant_id = $1
        WHERE ri.tenant_id = $1 AND r.status = 'completed'
          AND r.return_date >= $2 AND r.return_date < $3
        GROUP BY ri.product_id
      )
      SELECT COALESCE(s.product_id, r.product_id) AS "productId",
             COALESCE(s.name, p.name) AS "productName", p.sku, c.name AS "category",
             COALESCE(s.qty, 0) - COALESCE(r.qty, 0) AS "quantity",
             COALESCE(r.qty, 0) AS "returnedQuantity",
             COALESCE(s.revenue, 0) - COALESCE(r.revenue, 0) AS "revenue",
             COALESCE(s.cost, 0) - COALESCE(r.cost, 0) AS "cost"
      FROM sold s
      FULL OUTER JOIN returned r ON r.product_id = s.product_id
      LEFT JOIN products p ON p.id = COALESCE(s.product_id, r.product_id) AND p.tenant_id = $1
      LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = $1
      ORDER BY (COALESCE(s.revenue, 0) - COALESCE(r.revenue, 0)) - (COALESCE(s.cost, 0) - COALESCE(r.cost, 0)) DESC
      LIMIT $4
      `,
      [tenantId, range.fromTs, range.toExclusiveTs, limit]
    );
    const items = rows.map((r: any) => {
      const revenue = n(r.revenue);
      const cost = n(r.cost);
      const profit = revenue - cost;
      return {
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        category: r.category,
        quantity: round(n(r.quantity), 3),
        returnedQuantity: round(n(r.returnedQuantity), 3),
        revenue: round(revenue),
        cost: round(cost),
        profit: round(profit),
        margin: revenue > 0 ? round((profit / revenue) * 100, 1) : 0,
      };
    });
    const totals = items.reduce(
      (t: any, i: any) => ({
        revenue: t.revenue + i.revenue,
        cost: t.cost + i.cost,
        profit: t.profit + i.profit,
      }),
      { revenue: 0, cost: 0, profit: 0 }
    );
    return {
      period: { from: range.from, to: range.to },
      totals: {
        revenue: round(totals.revenue),
        cost: round(totals.cost),
        profit: round(totals.profit),
        margin: totals.revenue > 0 ? round((totals.profit / totals.revenue) * 100, 1) : 0,
      },
      items,
      losers: items.filter((i: any) => i.profit < 0),
    };
  }

  /** أداء الكاشير/الموظفين: عدد الفواتير والإجمالي ومتوسط الفاتورة والخصومات والإلغاءات. */
  async byCashier(tenantId: string, range: DateRange) {
    const rows = await this.db.query(
      `
      SELECT s.created_by AS "userId", COALESCE(u.full_name, 'مستخدم محذوف') AS "name", u.email,
             COUNT(*) FILTER (WHERE s.status IN ('completed', 'returned'))::int AS "salesCount",
             COALESCE(SUM(s.total) FILTER (WHERE s.status IN ('completed', 'returned')), 0) AS "total",
             COALESCE(SUM(s.total - s.cogs) FILTER (WHERE s.status IN ('completed', 'returned')), 0) AS "grossProfit",
             COALESCE(SUM(s.discount_amount) FILTER (WHERE s.status IN ('completed', 'returned')), 0) AS "discounts",
             COUNT(*) FILTER (WHERE s.status = 'cancelled')::int AS "cancelledCount",
             COALESCE(SUM(s.total) FILTER (WHERE s.status = 'cancelled'), 0) AS "cancelledTotal"
      FROM sales s
      LEFT JOIN users u ON u.id = s.created_by AND u.tenant_id = $1
      WHERE s.tenant_id = $1 AND s.sale_date >= $2 AND s.sale_date < $3
      GROUP BY s.created_by, u.full_name, u.email
      ORDER BY "total" DESC
      `,
      [tenantId, range.fromTs, range.toExclusiveTs]
    );
    const returns = await this.db.query(
      `SELECT created_by AS "userId", COUNT(*)::int AS c, COALESCE(SUM(total), 0) AS t
       FROM sale_returns WHERE tenant_id = $1 AND status = 'completed'
         AND return_date >= $2 AND return_date < $3 GROUP BY created_by`,
      [tenantId, range.fromTs, range.toExclusiveTs]
    );
    const retMap = new Map<string, any>(returns.map((r: any) => [r.userId, r]));
    return {
      period: { from: range.from, to: range.to },
      items: rows.map((r: any) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        salesCount: r.salesCount,
        total: round(n(r.total)),
        grossProfit: round(n(r.grossProfit)),
        averageTicket: r.salesCount ? round(n(r.total) / r.salesCount) : 0,
        discounts: round(n(r.discounts)),
        cancelledCount: r.cancelledCount,
        cancelledTotal: round(n(r.cancelledTotal)),
        returnsCount: retMap.get(r.userId)?.c || 0,
        returnsTotal: round(n(retMap.get(r.userId)?.t)),
      })),
    };
  }

  /** المتحصلات حسب طريقة الدفع (كاش / فيزا / محافظ...). */
  async byPaymentMethod(tenantId: string, range: DateRange) {
    const rows = await this.db.query(
      `
      SELECT pm.id AS "methodId", COALESCE(pm.name_ar, pm.name) AS "name", pm.code AS "code",
             COUNT(p.id)::int AS "count", COALESCE(SUM(p.amount), 0) AS "total"
      FROM payments p
      JOIN payment_methods pm ON pm.id = p.payment_method_id AND pm.tenant_id = $1
      WHERE p.tenant_id = $1 AND p.status = 'completed' AND p.cancelled_at IS NULL
        AND p.payment_date >= $2 AND p.payment_date < $3
      GROUP BY pm.id, pm.name_ar, pm.name, pm.code
      ORDER BY "total" DESC
      `,
      [tenantId, range.fromTs, range.toExclusiveTs]
    );
    const grand = rows.reduce((s: number, r: any) => s + n(r.total), 0);
    return {
      period: { from: range.from, to: range.to },
      total: round(grand),
      items: rows.map((r: any) => ({
        methodId: r.methodId,
        name: r.name,
        code: r.code,
        count: r.count,
        total: round(n(r.total)),
        share: grand > 0 ? round((n(r.total) / grand) * 100, 1) : 0,
      })),
    };
  }

  /** تقييم المخزون بالتكلفة وبسعر البيع لكل مخزن ولكل قسم. */
  async inventoryValuation(tenantId: string) {
    const byWarehouse = await this.db.query(
      `
      SELECT w.id AS "warehouseId", w.name AS "warehouse", w.is_main AS "isMain",
             COUNT(DISTINCT i.product_id) FILTER (WHERE i.quantity > 0)::int AS "products",
             COALESCE(SUM(i.quantity), 0) AS "quantity",
             COALESCE(SUM(i.quantity * i.weighted_avg_cost), 0) AS "costValue",
             COALESCE(SUM(i.quantity * p.selling_price), 0) AS "retailValue"
      FROM warehouses w
      LEFT JOIN inventory i ON i.warehouse_id = w.id AND i.tenant_id = $1
      LEFT JOIN products p ON p.id = i.product_id AND p.tenant_id = $1 AND p.deleted_at IS NULL
      WHERE w.tenant_id = $1 AND w.deleted_at IS NULL
      GROUP BY w.id, w.name, w.is_main
      ORDER BY w.is_main DESC, w.name
      `,
      [tenantId]
    );
    const byCategory = await this.db.query(
      `
      SELECT COALESCE(c.name, 'بدون قسم') AS "category",
             COUNT(DISTINCT p.id) FILTER (WHERE i.quantity > 0)::int AS "products",
             COALESCE(SUM(i.quantity), 0) AS "quantity",
             COALESCE(SUM(i.quantity * i.weighted_avg_cost), 0) AS "costValue",
             COALESCE(SUM(i.quantity * p.selling_price), 0) AS "retailValue"
      FROM inventory i
      JOIN products p ON p.id = i.product_id AND p.tenant_id = $1 AND p.deleted_at IS NULL
      LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = $1
      WHERE i.tenant_id = $1
      GROUP BY c.name
      ORDER BY "costValue" DESC
      `,
      [tenantId]
    );
    const map = (r: any) => {
      const cost = n(r.costValue);
      const retail = n(r.retailValue);
      return {
        ...r,
        quantity: round(n(r.quantity), 3),
        costValue: round(cost),
        retailValue: round(retail),
        potentialProfit: round(retail - cost),
      };
    };
    const w = byWarehouse.map(map);
    const totals = w.reduce(
      (t: any, r: any) => ({
        quantity: t.quantity + r.quantity,
        costValue: t.costValue + r.costValue,
        retailValue: t.retailValue + r.retailValue,
      }),
      { quantity: 0, costValue: 0, retailValue: 0 }
    );
    return {
      totals: {
        quantity: round(totals.quantity, 3),
        costValue: round(totals.costValue),
        retailValue: round(totals.retailValue),
        potentialProfit: round(totals.retailValue - totals.costValue),
      },
      byWarehouse: w,
      byCategory: byCategory.map(map),
    };
  }

  /** البضاعة الراكدة: منتجات عليها رصيد وماتباعتش من N يوم — فلوس مجمدة. */
  async deadStock(tenantId: string, days: number) {
    const rows = await this.db.query(
      `
      WITH stock AS (
        SELECT product_id, SUM(quantity) AS qty, SUM(quantity * weighted_avg_cost) AS value
        FROM inventory WHERE tenant_id = $1 GROUP BY product_id HAVING SUM(quantity) > 0
      ),
      last_sale AS (
        SELECT si.product_id, MAX(s.sale_date) AS last_sold
        FROM sale_items si JOIN sales s ON s.id = si.sale_id AND s.tenant_id = $1
        WHERE si.tenant_id = $1 AND s.status IN ('completed', 'returned')
        GROUP BY si.product_id
      )
      SELECT p.id AS "productId", p.name AS "productName", p.sku, p.barcode, c.name AS "category",
             st.qty AS "quantity", st.value AS "costValue", ls.last_sold AS "lastSoldAt", p.created_at AS "createdAt"
      FROM stock st
      JOIN products p ON p.id = st.product_id AND p.tenant_id = $1 AND p.deleted_at IS NULL
      LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = $1
      LEFT JOIN last_sale ls ON ls.product_id = p.id
      WHERE COALESCE(ls.last_sold, p.created_at) < NOW() - ($2 || ' days')::interval
      ORDER BY st.value DESC
      LIMIT 500
      `,
      [tenantId, String(days)]
    );
    const items = rows.map((r: any) => ({
      ...r,
      quantity: round(n(r.quantity), 3),
      costValue: round(n(r.costValue)),
      daysSinceLastSale: Math.floor(
        (Date.now() - new Date(r.lastSoldAt || r.createdAt).getTime()) / 86400000
      ),
      neverSold: !r.lastSoldAt,
    }));
    return {
      days,
      totalValue: round(items.reduce((s: number, i: any) => s + i.costValue, 0)),
      count: items.length,
      items,
    };
  }

  /** خريطة المبيعات بالساعة وأيام الأسبوع (بتوقيت التاجر) لتنظيم الورديات. */
  async salesHeatmap(tenantId: string, range: DateRange) {
    const [tenant] = await this.db.query(`SELECT timezone FROM tenants WHERE id = $1`, [tenantId]);
    let tz = tenant?.timezone || 'Africa/Cairo';
    const [valid] = await this.db.query(`SELECT 1 AS ok FROM pg_timezone_names WHERE name = $1`, [
      tz,
    ]);
    if (!valid) tz = 'UTC';
    const rows = await this.db.query(
      `
      SELECT EXTRACT(DOW FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS "dow",
             EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS "hour",
             COUNT(*)::int AS "count", COALESCE(SUM(s.total), 0) AS "total"
      FROM sales s
      WHERE s.tenant_id = $1 AND s.status IN ('completed', 'returned')
        AND s.sale_date >= $2 AND s.sale_date < $3
      GROUP BY 1, 2
      `,
      [tenantId, range.fromTs, range.toExclusiveTs, tz]
    );
    return {
      period: { from: range.from, to: range.to },
      timezone: tz,
      cells: rows.map((r: any) => ({
        dow: r.dow,
        hour: r.hour,
        count: r.count,
        total: round(n(r.total)),
      })),
    };
  }

  /** أفضل العملاء في الفترة + المديونيات الحالية. */
  async topCustomers(tenantId: string, range: DateRange) {
    const rows = await this.db.query(
      `
      SELECT c.id AS "customerId", c.name, c.phone, c.balance AS "balance",
             COUNT(s.id)::int AS "salesCount", COALESCE(SUM(s.total), 0) AS "total",
             COALESCE(SUM(s.total - s.cogs), 0) AS "grossProfit", MAX(s.sale_date) AS "lastPurchaseAt"
      FROM sales s
      JOIN customers c ON c.id = s.customer_id AND c.tenant_id = $1
      WHERE s.tenant_id = $1 AND s.status IN ('completed', 'returned')
        AND s.sale_date >= $2 AND s.sale_date < $3
      GROUP BY c.id, c.name, c.phone, c.balance
      ORDER BY "total" DESC
      LIMIT 100
      `,
      [tenantId, range.fromTs, range.toExclusiveTs]
    );
    const [debt] = await this.db.query(
      `SELECT COUNT(*)::int AS "count", COALESCE(SUM(balance), 0) AS "total"
       FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL AND balance > 0`,
      [tenantId]
    );
    return {
      period: { from: range.from, to: range.to },
      receivables: { customers: debt?.count || 0, total: round(n(debt?.total)) },
      items: rows.map((r: any) => ({
        ...r,
        balance: round(n(r.balance)),
        total: round(n(r.total)),
        grossProfit: round(n(r.grossProfit)),
      })),
    };
  }
}
