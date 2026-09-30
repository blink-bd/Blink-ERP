import { FeaturesModule } from '@/modules/features/features.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { SuppliersModule } from '@/modules/suppliers/suppliers.module';

@Module({
  imports: [
    FeaturesModule,TypeOrmModule.forFeature([Purchase, PurchaseItem]), InventoryModule, SuppliersModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
