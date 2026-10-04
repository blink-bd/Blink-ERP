import { FeaturesModule } from '@/modules/features/features.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterShift } from './entities/cash-register-shift.entity';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';

@Module({
  imports: [
    FeaturesModule,
    TypeOrmModule.forFeature([CashRegister, CashRegisterShift, CashTransaction]),
  ],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService],
})
export class CashRegisterModule {}
