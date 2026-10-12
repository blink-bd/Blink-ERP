import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeaturesModule } from '@/modules/features/features.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceInvoice } from './maintenance-invoice.entity';
import { MaintenanceService } from './maintenance.service';

@Module({
  // FeaturesGuard يستخدمه الـ controller، ولازم FeaturesService يكون متاح داخل هذا الـ module.
  imports: [TypeOrmModule.forFeature([MaintenanceInvoice]), FeaturesModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
