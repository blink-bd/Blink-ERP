import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sale } from '@/modules/sales/entities/sale.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { safeTimezone } from '@/common/utils/tenant-time';

const TOKEN_RE = /^[a-f0-9]{64}$/i;
const n = (value: unknown) => Number(value) || 0;
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  private seller(tenant: Tenant) {
    return {
      businessName: tenant.businessNameAr || tenant.businessName,
      phone: tenant.phone || undefined,
      address: tenant.address || undefined,
    };
  }

  /** الإيصال الإلكتروني العام لفاتورة البيع (اللينك اللي بيتبعت للعميل). */
  async findPublicReceipt(token: string) {
    if (!TOKEN_RE.test(token)) throw new NotFoundException('الإيصال غير موجود');
    const sale = await this.sales.findOne({
      where: { receiptToken: token, status: 'completed' },
      relations: ['items'],
    });
    if (!sale) throw new NotFoundException('الإيصال غير موجود أو غير متاح');

    const tenant = await this.tenants.findOne({
      where: { id: sale.tenantId, isActive: true },
    });
    if (!tenant) throw new NotFoundException('الإيصال غير موجود أو غير متاح');

    const [extra] = await this.dataSource.query(
      `SELECT COALESCE((SELECT SUM(r.total) FROM sale_returns r
                        WHERE r.tenant_id = s.tenant_id AND r.original_sale_id = s.id), 0) AS "returned",
              COALESCE((SELECT SUM(r.invoice_credit) FROM sale_returns r
                        WHERE r.tenant_id = s.tenant_id AND r.original_sale_id = s.id), 0) AS "credited"
       FROM sales s
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [sale.id, sale.tenantId]
    );
    const total = n(sale.total);
    const paid = n(sale.paidAmount);
    const returned = n(extra?.returned);
    const remaining = Math.max(0, round(total - paid - n(extra?.credited)));

    return {
      kind: 'sale',
      verified: true,
      receiptNumber: sale.saleNumber,
      issuedAt: sale.saleDate,
      currency: tenant.currency,
      timezone: safeTimezone(tenant.timezone),
      seller: this.seller(tenant),
      // الإيصال العام مايظهرش بيانات العميل (اللينك ممكن يتبعت لأي حد).
      totals: {
        subtotal: n(sale.subtotal),
        discount: n(sale.discountAmount),
        tax: n(sale.taxAmount),
        total,
        paid,
        returned: round(returned),
        remaining,
        paymentStatus: sale.paymentStatus,
      },
      items: (sale.items || []).map((item) => ({
        name: item.productName,
        sku: item.productSku || undefined,
        quantity: Number(item.quantity),
        unit: item.unit || undefined,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
      })),
    };
  }

  /** فاتورة المشتريات العامة (اللينك اللي بيتبعت للمورد). */
  async findPublicPurchase(token: string) {
    if (!TOKEN_RE.test(token)) throw new NotFoundException('الفاتورة غير موجودة');
    const [purchase] = await this.dataSource.query(
      `SELECT p.id, p.tenant_id AS "tenantId", p.purchase_number AS "purchaseNumber",
              p.supplier_invoice_number AS "supplierInvoiceNumber", p.purchase_date AS "purchaseDate",
              p.subtotal, p.discount_amount AS "discountAmount", p.tax_amount AS "taxAmount",
              p.shipping_cost AS "shippingCost", p.total, p.paid_amount AS "paidAmount",
              p.payment_status AS "paymentStatus", s.name AS "supplierName"
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.tenant_id = p.tenant_id
       WHERE p.share_token = $1 AND p.status = 'completed'`,
      [token]
    );
    if (!purchase) throw new NotFoundException('الفاتورة غير موجودة أو غير متاحة');
    const tenant = await this.tenants.findOne({
      where: { id: purchase.tenantId, isActive: true },
    });
    if (!tenant) throw new NotFoundException('الفاتورة غير موجودة أو غير متاحة');

    const items = await this.dataSource.query(
      `SELECT pr.name, pr.sku, pr.unit, pi.quantity, pi.unit_cost AS "unitCost", pi.total
       FROM purchase_items pi
       LEFT JOIN products pr ON pr.id = pi.product_id AND pr.tenant_id = pi.tenant_id
       WHERE pi.purchase_id = $1 AND pi.tenant_id = $2
       ORDER BY pi.created_at, pi.id`,
      [purchase.id, purchase.tenantId]
    );
    const total = n(purchase.total);
    const paid = n(purchase.paidAmount);
    return {
      kind: 'purchase',
      verified: true,
      receiptNumber: purchase.purchaseNumber,
      supplierInvoiceNumber: purchase.supplierInvoiceNumber || undefined,
      issuedAt: purchase.purchaseDate,
      currency: tenant.currency,
      timezone: safeTimezone(tenant.timezone),
      // في فاتورة المشتريات التاجر هو المشتري والمورد هو البائع.
      seller: this.seller(tenant),
      supplier: purchase.supplierName ? { name: purchase.supplierName } : undefined,
      totals: {
        subtotal: n(purchase.subtotal),
        discount: n(purchase.discountAmount),
        tax: n(purchase.taxAmount),
        shipping: n(purchase.shippingCost),
        total,
        paid,
        returned: 0,
        remaining: Math.max(0, round(total - paid)),
        paymentStatus: purchase.paymentStatus,
      },
      items: items.map((item: any) => ({
        name: item.name || 'صنف',
        sku: item.sku || undefined,
        quantity: Number(item.quantity),
        unit: item.unit || undefined,
        unitPrice: Number(item.unitCost),
        total: Number(item.total),
      })),
    };
  }
}
