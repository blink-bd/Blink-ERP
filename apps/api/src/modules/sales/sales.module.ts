import { FeaturesModule } from '@/modules/features/features.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { ProductsModule } from '@/modules/products/products.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { CustomersModule } from '@/modules/customers/customers.module';

@Module({
  imports: [
    FeaturesModule,
    TypeOrmModule.forFeature([Sale, SaleItem, Payment, PaymentMethod, SaleReturn, SaleReturnItem]),
    ProductsModule,
    InventoryModule,
    CustomersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
