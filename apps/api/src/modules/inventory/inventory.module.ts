import { FeaturesModule } from '@/modules/features/features.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';

@Module({
  imports: [
    FeaturesModule,TypeOrmModule.forFeature([Branch, Warehouse, Inventory, InventoryTransaction])],
  controllers: [InventoryController, BranchesController, WarehousesController],
  providers: [InventoryService, BranchesService, WarehousesService],
  exports: [InventoryService, BranchesService, WarehousesService],
})
export class InventoryModule {}
