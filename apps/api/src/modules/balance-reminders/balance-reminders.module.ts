import { forwardRef, Module } from '@nestjs/common';
import { FeaturesModule } from '@/modules/features/features.module';
import {
  BalanceRemindersController,
  BalanceReminderJobController,
} from './balance-reminders.controller';
import { BalanceRemindersService } from './balance-reminders.service';

@Module({
  imports: [forwardRef(() => FeaturesModule)],
  controllers: [BalanceRemindersController, BalanceReminderJobController],
  providers: [BalanceRemindersService],
  exports: [BalanceRemindersService],
})
export class BalanceRemindersModule {}
