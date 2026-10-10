import { Module } from '@nestjs/common';
import { ProductsModule } from '@/modules/products/products.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { SuppliersModule } from '@/modules/suppliers/suppliers.module';
import { FeaturesModule } from '@/modules/features/features.module';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';

@Module({
  imports: [FeaturesModule, ProductsModule, CustomersModule, SuppliersModule],
  controllers: [DataTransferController],
  providers: [DataTransferService],
})
export class DataTransferModule {}
