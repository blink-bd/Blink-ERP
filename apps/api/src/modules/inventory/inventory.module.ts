import { FeaturesModule } from '@/modules/features/features.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { InventoryTransfer } from './entities/inventory-transfer.entity';
import { InventoryTransferItem } from './entities/inventory-transfer-item.entity';
import { InventoryService } from './inventory.service';
import { TransfersService } from './transfers.service';
import { InventoryController } from './inventory.controller';
import { TransfersController } from './transfers.controller';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';

@Module({
  imports: [
    FeaturesModule,
    TypeOrmModule.forFeature([
      Branch,
      Warehouse,
      Inventory,
      InventoryTransaction,
      InventoryTransfer,
      InventoryTransferItem,
    ]),
  ],
  controllers: [InventoryController, TransfersController, BranchesController, WarehousesController],
  providers: [InventoryService, TransfersService, BranchesService, WarehousesService],
  exports: [InventoryService, TransfersService, BranchesService, WarehousesService],
})
export class InventoryModule {}
