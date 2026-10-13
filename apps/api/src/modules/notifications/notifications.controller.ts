import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { callingCodeFor, toInternationalPhone } from '@/common/utils/phone';
import { NotificationsService, TENANT_ALERT_TYPES } from './notifications.service';
import { UpdateAlertSettingsDto } from './dto/alert-settings.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard, PermissionGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /** حالة قنوات الإرسال على السيرفر (من غير عناوين إدارة النظام). */
  @Get('status')
  async getStatus() {
    return { success: true, data: await this.channelStatus() };
  }

  private async channelStatus() {
    const status = await this.notifications.getStatus();
    return {
      email: { configured: status.email.configured },
      whatsapp: { configured: status.whatsapp.configured, mode: status.whatsapp.mode },
    };
  }

  /** واتساب وإيميل التاجر لاستقبال تنبيهات حسابه + أنواع التنبيهات المفعّلة. */
  @Get('settings')
  @RequireFeature('settings.alerts')
  @RequirePermission('settings.view')
  async getSettings(@Request() req) {
    return { success: true, data: await this.loadSettings(req.tenantId) };
  }

  @Put('settings')
  @RequireFeature('settings.alerts')
  @RequirePermission('settings.update')
  async updateSettings(@Request() req, @Body() dto: UpdateAlertSettingsDto) {
    const [tenant] = await this.dataSource.query(
      `SELECT timezone, country FROM tenants WHERE id = $1`,
      [req.tenantId]
    );
    let whatsapp: string | null | undefined = dto.alertWhatsapp;
    if (whatsapp) {
      const normalized = toInternationalPhone(
        whatsapp,
        callingCodeFor(tenant?.timezone, tenant?.country)
      );
      if (!normalized) throw new BadRequestException('رقم الواتساب غير صحيح');
      whatsapp = `+${normalized}`;
    }
    const known = new Set<string>(TENANT_ALERT_TYPES.map((type) => type.key));
    const events =
      dto.alertEvents === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(dto.alertEvents)
              .filter(([key]) => known.has(key))
              .map(([key, value]) => [key, value === true])
          );

    const sets: string[] = [];
    const params: unknown[] = [req.tenantId];
    if (dto.alertWhatsapp !== undefined) {
      params.push(whatsapp ?? null);
      sets.push(`alert_whatsapp = $${params.length}`);
    }
    if (dto.alertEmail !== undefined) {
      params.push(dto.alertEmail ? dto.alertEmail.trim().toLowerCase() : null);
      sets.push(`alert_email = $${params.length}`);
    }
    if (events !== undefined) {
      params.push(JSON.stringify(events));
      sets.push(`alert_events = $${params.length}::jsonb`);
    }
    if (sets.length) {
      await this.dataSource.query(
        `UPDATE tenants SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        params
      );
      this.notifications.invalidateTenant(req.tenantId);
    }
    return {
      success: true,
      data: await this.loadSettings(req.tenantId),
      message: 'تم حفظ إعدادات التنبيهات',
    };
  }

  /** رسالة تجريبية لواتساب/إيميل التاجر المحفوظين في الإعدادات. */
  @Post('test')
  @RequireFeature('settings.alerts')
  @RequirePermission('settings.update')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async sendTest(@Request() req) {
    const settings = await this.loadSettings(req.tenantId);
    if (!settings.alertEmail && !settings.alertWhatsapp) {
      throw new BadRequestException('احفظ رقم واتساب أو إيميل الأول');
    }
    const result = await this.notifications.sendTenantTest(
      req.tenantId,
      { email: settings.alertEmail, whatsapp: settings.alertWhatsapp },
      req.user?.email
    );
    return { success: true, data: { ...result, configured: await this.channelStatus() } };
  }

  private async loadSettings(tenantId: string) {
    const [row] = await this.dataSource.query(
      `SELECT alert_email AS "alertEmail", alert_whatsapp AS "alertWhatsapp",
              alert_events AS "alertEvents"
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const saved: Record<string, boolean> = row?.alertEvents || {};
    return {
      alertEmail: row?.alertEmail || null,
      alertWhatsapp: row?.alertWhatsapp || null,
      types: TENANT_ALERT_TYPES.map((type) => ({
        key: type.key,
        label: type.label,
        enabled: saved[type.key] !== false,
      })),
      channels: await this.channelStatus(),
    };
  }
}
