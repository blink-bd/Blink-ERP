import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { ProductsService } from '@/modules/products/products.service';

interface CreatePurchaseInput {
  supplierId: string;
  warehouseId: string;
  supplierInvoiceNumber?: string;
  items: { productId: string; quantity: number; unitCost: number; taxRate?: number }[];
  paidAmount?: number;
  notes?: string;
}

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase) private readonly purchasesRepository: Repository<Purchase>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService
  ) {}

  private async generatePurchaseNumber(tenantId: string): Promise<string> {
    const count = await this.purchasesRepository.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await this.purchasesRepository.findAndCount({
      where: { tenantId },
      order: { purchaseDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(tenantId: string, id: string): Promise<Purchase> {
    const purchase = await this.purchasesRepository.findOne({ where: { id, tenantId }, relations: ['items'] });
    if (!purchase) throw new NotFoundException('أمر الشراء غير موجود');
    return purchase;
  }

  /**
   * Creates a purchase, increases stock (with weighted-average cost recalculation
   * via InventoryService), and updates the supplier's balance for any unpaid amount.
   */
  async create(tenantId: string, dto: CreatePurchaseInput, userId: string): Promise<Purchase> {
    return this.dataSource.transaction(async (manager) => {
      let subtotal = 0;
      let taxAmount = 0;
      const itemsToSave: Partial<PurchaseItem>[] = [];

      for (const itemInput of dto.items) {
        const lineSubtotal = itemInput.quantity * itemInput.unitCost;
        const taxRate = itemInput.taxRate || 0;
        const lineTax = (lineSubtotal * taxRate) / 100;

        subtotal += lineSubtotal;
        taxAmount += lineTax;

        itemsToSave.push({
          tenantId,
          productId: itemInput.productId,
          quantity: itemInput.quantity,
          unitCost: itemInput.unitCost,
          taxRate,
          taxAmount: lineTax,
          total: lineSubtotal + lineTax,
        });

        await this.inventoryService.adjustInventory({
          tenantId,
          productId: itemInput.productId,
          warehouseId: dto.warehouseId,
          quantity: itemInput.quantity,
          unitCost: itemInput.unitCost,
          type: 'purchase',
          userId,
        });

        // لو سعر التكلفة في فاتورة الشراء مختلف عن سعر التكلفة المسجّل للمنتج،
        // حدّث سعر التكلفة تلقائيًا ونبّه التاجر إنه يراجع سعر البيع
        const product = await this.productsService.findById(tenantId, itemInput.productId);
        if (Math.abs(Number(product.costPrice) - itemInput.unitCost) > 0.0001) {
          const oldCost = Number(product.costPrice);
          await this.productsService.update(tenantId, itemInput.productId, {
            costPrice: itemInput.unitCost,
            needsPriceReview: true,
            priceReviewNote: `تغيّر سعر التكلفة من ${oldCost.toFixed(2)} إلى ${itemInput.unitCost.toFixed(2)} في فاتورة شراء بتاريخ ${new Date().toLocaleDateString('ar')} — راجع سعر البيع القطاعي والجملة`,
          } as any, userId);
        }
      }

      const total = subtotal + taxAmount;
      const paidAmount = dto.paidAmount || 0;
      const purchaseNumber = await this.generatePurchaseNumber(tenantId);

      const purchase = manager.create(Purchase, {
        tenantId,
        purchaseNumber,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        purchaseDate: new Date(),
        subtotal,
        taxAmount,
        total,
        paidAmount,
        paymentStatus: paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
        notes: dto.notes,
        createdBy: userId,
      });

      const saved = await manager.save(purchase);

      for (const item of itemsToSave) {
        await manager.save(manager.create(PurchaseItem, { ...item, purchaseId: saved.id }));
      }

      if (total - paidAmount > 0) {
        await this.suppliersService.adjustBalance(tenantId, dto.supplierId, total - paidAmount);
      }

      return this.findById(tenantId, saved.id);
    });
  }
}
