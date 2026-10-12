import { Module } from '@nestjs/common';
import {
  BalanceRemindersController,
  BalanceReminderJobController,
} from './balance-reminders.controller';
import { BalanceRemindersService } from './balance-reminders.service';

@Module({
  controllers: [BalanceRemindersController, BalanceReminderJobController],
  providers: [BalanceRemindersService],
  exports: [BalanceRemindersService],
})
export class BalanceRemindersModule {}
