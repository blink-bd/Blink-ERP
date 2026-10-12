import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '@/modules/sales/entities/sale.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>
  ) {}

  async findPublicReceipt(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new NotFoundException('الإيصال غير موجود');
    const sale = await this.sales.findOne({
      where: { receiptToken: token, status: 'completed' },
      relations: ['items'],
    });
    if (!sale) throw new NotFoundException('الإيصال غير موجود أو غير متاح');

    const tenant = await this.tenants.findOne({
      where: { id: sale.tenantId, isActive: true },
    });
    if (!tenant) throw new NotFoundException('الإيصال غير موجود أو غير متاح');

    return {
      verified: true,
      receiptNumber: sale.saleNumber,
      issuedAt: sale.saleDate,
      currency: tenant.currency,
      seller: {
        businessName: tenant.businessNameAr || tenant.businessName,
        phone: tenant.phone || undefined,
        address: tenant.address || undefined,
      },
      totals: {
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discountAmount),
        tax: Number(sale.taxAmount),
        total: Number(sale.total),
        paid: Number(sale.paidAmount),
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
}
