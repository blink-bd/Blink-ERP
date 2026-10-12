import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { BalanceRemindersService } from './balance-reminders.service';

@ApiTags('balance-reminders')
@ApiBearerAuth()
@Controller({ path: 'balance-reminders', version: '1' })
@RequireFeature('balance_reminders')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class BalanceRemindersController {
  constructor(private readonly reminders: BalanceRemindersService) {}

  @Get()
  async list(@Request() req) {
    return { success: true, data: await this.reminders.list(req.tenantId) };
  }

  @Post(':id/snooze')
  async snooze(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.reminders.snoozeCustomerReminder(req.tenantId, id) };
  }
}

@ApiTags('operations')
@Controller({ path: 'ops/balance-reminders/run', version: '1' })
export class BalanceReminderJobController {
  constructor(
    private readonly config: ConfigService,
    private readonly reminders: BalanceRemindersService
  ) {}

  @Post()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async run(@Headers('x-reminder-job-token') token?: string) {
    const expected = this.config.get<string>('REMINDERS_JOB_TOKEN');
    if (!expected || !token || !this.matches(expected, token)) {
      throw new UnauthorizedException('مفتاح تشغيل تذكيرات الأرصدة غير صالح');
    }
    return { success: true, data: await this.reminders.runDaily() };
  }

  private matches(expected: string, actual: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
  }
}
