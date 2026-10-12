import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationsService } from '@/modules/notifications/notifications.service';

class BackupAlertDto {
  @IsIn(['success', 'failed'])
  status: 'success' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objectKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

@Controller({ path: 'ops/backup-alert', version: '1' })
export class BackupAlertsController {
  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async report(
    @Headers('x-backup-alert-token') token: string | undefined,
    @Body() dto: BackupAlertDto
  ) {
    const expected = this.config.get<string>('BACKUP_ALERT_TOKEN');
    if (!expected || !token || !this.matches(expected, token)) {
      throw new UnauthorizedException('مفتاح تنبيه النسخ الاحتياطي غير صالح');
    }
    const result = await this.notifications.sendBackupAlert(dto.status, dto.objectKey, dto.details);
    return { success: true, data: result };
  }

  private matches(expected: string, actual: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
  }
}
