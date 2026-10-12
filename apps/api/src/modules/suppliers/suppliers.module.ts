import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { FeaturesModule } from '@/modules/features/features.module';
import { BalanceRemindersModule } from '@/modules/balance-reminders/balance-reminders.module';

@Module({
  imports: [
    FeaturesModule,
    BalanceRemindersModule,
    TypeOrmModule.forFeature([Supplier, SupplierPayment]),
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
