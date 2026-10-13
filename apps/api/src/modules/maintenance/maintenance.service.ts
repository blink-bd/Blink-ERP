import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, IsNull, Repository } from 'typeorm';
import { resolveTenantBranch } from '@/common/utils/branch-accounting';
import { normalizeInclusiveDateRange } from '@/common/utils/date-range';
import { getTenantTimezone, tenantYear } from '@/common/utils/tenant-time';
import { Customer } from '@/modules/customers/entities/customer.entity';
import { CreateMaintenanceInvoiceDto } from './dto/create-maintenance-invoice.dto';
import { MaintenanceInvoice } from './maintenance-invoice.entity';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceInvoice)
    private readonly invoices: Repository<MaintenanceInvoice>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async create(
    tenantId: string,
    userId: string,
    assignedBranchId: string | undefined,
    dto: CreateMaintenanceInvoiceDto
  ) {
    const customerName = dto.customerName?.trim();
    const productName = dto.productName?.trim();
    const maintenanceDescription = dto.maintenanceDescription?.trim();
    const partsCost = Number(dto.partsCost);
    const servicePrice = Number(dto.servicePrice);
    if (!customerName) throw new BadRequestException('اسم العميل مطلوب في فاتورة الصيانة');
    if (!productName) throw new BadRequestException('بيانات المنتج مطلوبة في فاتورة الصيانة');
    if (!maintenanceDescription) throw new BadRequestException('اكتب وصف أعمال الصيانة');
    if (
      !Number.isFinite(partsCost) ||
      partsCost < 0 ||
      !Number.isFinite(servicePrice) ||
      servicePrice < 0
    ) {
      throw new BadRequestException('تكلفة القطع وسعر خدمة الصيانة يجب أن يكونا صفراً أو أكثر');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      const branchId = await resolveTenantBranch(
        manager,
        tenantId,
        dto.branchId || assignedBranchId
      );
      let customer: Customer;
      if (dto.customerId) {
        const existingCustomer = await manager.findOne(Customer, {
          where: { id: dto.customerId, tenantId, deletedAt: IsNull() },
        });
        if (!existingCustomer) throw new NotFoundException('العميل المحدد غير موجود');
        customer = existingCustomer;
      } else {
        customer = await manager.save(
          manager.create(Customer, {
            tenantId,
            name: customerName,
            phone: dto.customerPhone?.trim() || undefined,
            email: dto.customerEmail?.trim() || undefined,
            previousBalance: 0,
            balance: 0,
            customerType: 'retail',
            priceTier: 'retail',
            creditLimit: 0,
            isActive: true,
            createdBy: userId,
          })
        );
        if (branchId) {
          await manager.query(
            `INSERT INTO branch_party_balances (tenant_id, branch_id, party_type, party_id, balance)
             VALUES ($1, $2, 'customer', $3, 0)
             ON CONFLICT (tenant_id, branch_id, party_type, party_id) DO NOTHING`,
            [tenantId, branchId, customer.id]
          );
        }
      }

      const [{ count }] = await manager.query(
        'SELECT COUNT(*)::int AS count FROM maintenance_invoices WHERE tenant_id = $1',
        [tenantId]
      );
      const year = await tenantYear(manager, tenantId);
      const invoiceNumber = `MNT-${year}-${String(Number(count) + 1).padStart(5, '0')}`;
      const invoice = await manager.save(
        manager.create(MaintenanceInvoice, {
          tenantId,
          branchId,
          invoiceNumber,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          productName,
          productModel: dto.productModel?.trim() || undefined,
          productSerial: dto.productSerial?.trim() || undefined,
          productNotes: dto.productNotes?.trim() || undefined,
          maintenanceDescription,
          partsDescription: dto.partsDescription?.trim() || undefined,
          partsCost,
          servicePrice,
          status: 'completed',
          maintenanceDate: new Date(),
          createdBy: userId,
        })
      );
      return (
        (await manager.findOne(MaintenanceInvoice, { where: { id: invoice.id, tenantId } })) ||
        invoice
      );
    });
  }

  async list(
    tenantId: string,
    options: {
      startDate?: string;
      endDate?: string;
      branchIds?: string[];
      /** فروع نطاق العمل (null = الكل) — فلتر إضافي مش شرط وجود. */
      scopeBranchIds?: string[] | null;
    } = {}
  ) {
    const branchIds = options.branchIds?.length ? options.branchIds : undefined;
    if (branchIds?.some((id) => !isUUID(id))) throw new BadRequestException('معرّف فرع غير صالح');
    if (branchIds?.length) {
      const activeBranches = await this.dataSource.query(
        `SELECT id FROM branches WHERE tenant_id = $1 AND id = ANY($2::uuid[])
         AND deleted_at IS NULL AND is_active = true`,
        [tenantId, branchIds]
      );
      if (activeBranches.length !== new Set(branchIds).size) {
        throw new NotFoundException('أحد الفروع المحددة غير موجود أو غير نشط');
      }
    }
    const tz = await getTenantTimezone(this.dataSource, tenantId);
    const dateRange = normalizeInclusiveDateRange(options.startDate, options.endDate, tz);
    const startDate = dateRange.startDate || undefined;
    const endDate = dateRange.endDate || undefined;
    if (startDate && Number.isNaN(Date.parse(startDate))) {
      throw new BadRequestException('تاريخ البداية غير صالح');
    }
    if (endDate && Number.isNaN(Date.parse(endDate))) {
      throw new BadRequestException('تاريخ النهاية غير صالح');
    }
    if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
    const query = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.tenantId = :tenantId', { tenantId })
      .andWhere('invoice.status = :status', { status: 'completed' });
    if (startDate) query.andWhere('invoice.maintenanceDate >= :startDate', { startDate });
    if (endDate) query.andWhere('invoice.maintenanceDate <= :endDate', { endDate });
    if (branchIds?.length) query.andWhere('invoice.branchId IN (:...branchIds)', { branchIds });
    const scopeBranchIds = options.scopeBranchIds ?? null;
    if (scopeBranchIds) {
      query.andWhere('invoice.branchId = ANY(:scopeBranchIds)', { scopeBranchIds });
    }
    const [data, summary] = await Promise.all([
      query.orderBy('invoice.maintenanceDate', 'DESC').take(500).getMany(),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(service_price), 0) AS "serviceRevenue",
                COALESCE(SUM(parts_cost), 0) AS "partsCost",
                COALESCE(SUM(profit), 0) AS profit,
                COUNT(*) FILTER (WHERE source = 'sale_return')::int AS "returnRepairs",
                COALESCE(SUM(parts_cost) FILTER (WHERE source = 'sale_return'), 0) AS "returnRepairsCost"
         FROM maintenance_invoices
         WHERE tenant_id = $1 AND status = 'completed'
           AND ($2::timestamp IS NULL OR maintenance_date >= $2)
           AND ($3::timestamp IS NULL OR maintenance_date <= $3)
           AND ($4::uuid[] IS NULL OR branch_id = ANY($4::uuid[]))
           AND ($5::uuid[] IS NULL OR branch_id = ANY($5::uuid[]))`,
          [tenantId, startDate || null, endDate || null, branchIds || null, scopeBranchIds]
        )
        .then((rows) => rows[0]),
    ]);
    return {
      data,
      summary: {
        count: Number(summary.count || 0),
        serviceRevenue: Number(summary.serviceRevenue || 0),
        partsCost: Number(summary.partsCost || 0),
        profit: Number(summary.profit || 0),
        // صيانة الأصناف المرتجعة (داخلية: تكلفة من غير إيراد)
        returnRepairs: Number(summary.returnRepairs || 0),
        returnRepairsCost: Number(summary.returnRepairsCost || 0),
      },
    };
  }

  async findById(tenantId: string, id: string) {
    const invoice = await this.invoices.findOne({ where: { id, tenantId } });
    if (!invoice) throw new NotFoundException('فاتورة الصيانة غير موجودة');
    return invoice;
  }
}
