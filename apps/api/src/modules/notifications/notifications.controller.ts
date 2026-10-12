import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('status')
  getStatus() {
    return { success: true, data: this.notifications.getStatus() };
  }

  @Post('test')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  async sendTest(@Request() req) {
    const result = await this.notifications.sendOperationalAlert({
      event: 'system.test',
      title: 'اختبار قنوات التنبيه',
      details: {
        التاجر: req.user?.tenantId,
        المستخدم: req.user?.email,
        الرسالة: 'تم إرسال هذا الاختبار من إعدادات Blink ERP.',
      },
    });
    return { success: true, data: { ...result, configured: this.notifications.getStatus() } };
  }
}
