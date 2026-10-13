import {
  Body,
  ForbiddenException,
  Controller,
  Delete,
  UploadedFile,
  UseInterceptors,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  ParseUUIDPipe,
  Query,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response as ExpressResponse } from 'express';
import {
  MASTER_TOKEN_COOKIE,
  authCookieOptions,
  durationToMilliseconds,
} from '@/common/utils/auth-cookies';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterAdminService } from './master-admin.service';
import { AdminInsightsService } from './admin-insights.service';
import { PlatformChannelsService } from './platform-channels.service';
import { TestChannelsDto, UpdateChannelsDto } from './dto/channels.dto';
import { MasterAdminGuard } from './master-admin.guard';
import {
  DeleteTenantDto,
  MasterChangePasswordDto,
  MasterDisable2faDto,
  MasterLoginDto,
  MasterOtpDto,
  MasterPasswordConfirmDto,
  ResetTenantUserPasswordDto,
  TenantLimitsDto,
  TenantStatusDto,
  TenantSubscriptionDto,
} from './dto/master-admin.dto';
import { AuditService } from '@/modules/audit/audit.service';

@ApiTags('master-auth')
@Controller({ path: 'admin/auth', version: '1' })
export class MasterAuthController {
  constructor(
    private readonly service: MasterAdminService,
    private readonly config: ConfigService
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: MasterLoginDto,
    @Ip() ip: string,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    const result = await this.service.login(dto.email, dto.password, ip, dto.otp);
    res.cookie(
      MASTER_TOKEN_COOKIE,
      result.accessToken,
      authCookieOptions(this.config, {
        path: '/api/v1/admin',
        maxAge: durationToMilliseconds('8h', 8 * 60 * 60 * 1000),
      })
    );
    return { success: true, data: { admin: result.admin } };
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  async logout(
    @Request() req,
    @Ip() ip: string,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    await this.service.logoutAll(req.masterAdmin.id, ip);
    this.clearMasterCookie(res);
    return { success: true, message: 'تم تسجيل الخروج' };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  me(@Request() req) {
    return { success: true, data: this.service.publicAdmin(req.masterAdminEntity) };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Request() req,
    @Ip() ip: string,
    @Body() dto: MasterChangePasswordDto,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    const data = await this.service.changePassword(
      req.masterAdmin.id,
      dto.currentPassword,
      dto.newPassword,
      ip
    );
    this.setMasterCookie(res, data.accessToken);
    return { success: true, message: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى' };
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  async logoutAll(@Request() req, @Ip() ip: string) {
    await this.service.logoutAll(req.masterAdmin.id, ip);
    return { success: true, message: 'تم تسجيل الخروج من كل الأجهزة' };
  }

  @Post('2fa/setup')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async setup2fa(@Request() req, @Ip() ip: string, @Body() dto: MasterPasswordConfirmDto) {
    return {
      success: true,
      data: await this.service.twoFactorSetup(req.masterAdmin.id, dto.password, ip),
    };
  }

  @Post('2fa/enable')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async enable2fa(
    @Request() req,
    @Ip() ip: string,
    @Body() dto: MasterOtpDto,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    const data = await this.service.twoFactorEnable(req.masterAdmin.id, dto.otp, ip);
    this.setMasterCookie(res, data.accessToken);
    return { success: true, message: 'تم تفعيل المصادقة الثنائية' };
  }

  @Post('2fa/disable')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async disable2fa(@Request() req, @Ip() ip: string, @Body() dto: MasterDisable2faDto) {
    await this.service.twoFactorDisable(req.masterAdmin.id, dto.password, dto.otp, ip);
    return { success: true, message: 'تم إيقاف المصادقة الثنائية' };
  }

  private setMasterCookie(res: ExpressResponse, token: string) {
    res.cookie(
      MASTER_TOKEN_COOKIE,
      token,
      authCookieOptions(this.config, {
        path: '/api/v1/admin',
        maxAge: durationToMilliseconds('8h', 8 * 60 * 60 * 1000),
      })
    );
  }

  private clearMasterCookie(res: ExpressResponse) {
    res.clearCookie(MASTER_TOKEN_COOKIE, authCookieOptions(this.config, { path: '/api/v1/admin' }));
  }
}

@ApiTags('master-admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
@UseGuards(MasterAdminGuard)
export class MasterAdminController {
  constructor(
    private readonly service: MasterAdminService,
    private readonly auditService: AuditService,
    private readonly insights: AdminInsightsService,
    private readonly channels: PlatformChannelsService
  ) {}

  @Get('dashboard')
  async dashboard() {
    return { success: true, data: await this.insights.dashboard() };
  }

  // ---------- قنوات الإرسال (إيميل وواتساب) ----------
  @Get('notification-channels')
  async getChannels() {
    return { success: true, data: await this.channels.get() };
  }

  @Put('notification-channels')
  async updateChannels(@Request() req, @Ip() ip: string, @Body() dto: UpdateChannelsDto) {
    const data = await this.channels.update(dto, req.masterAdmin.email);
    await this.service.audit(
      req.masterAdmin.email,
      'NOTIFICATION_CHANNELS_UPDATED',
      'platform_settings',
      undefined,
      {
        emailProvider: dto.email?.provider,
        whatsapp: dto.whatsapp ? Boolean(dto.whatsapp.phoneNumberId) : undefined,
        secretsChanged: [
          dto.email?.smtpPassword ? 'smtpPassword' : null,
          dto.email?.apiKey ? 'emailApiKey' : null,
          dto.whatsapp?.accessToken ? 'whatsappToken' : null,
          ...(dto.clearSecrets || []).map((key) => `cleared:${key}`),
        ].filter(Boolean),
      },
      ip,
      'warning'
    );
    return { success: true, data, message: 'تم حفظ إعدادات قنوات الإرسال' };
  }

  @Post('notification-channels/test')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async testChannels(@Body() dto: TestChannelsDto) {
    return { success: true, data: await this.channels.test(dto) };
  }

  // ---------- ملف التاجر ----------
  @Get('tenants/:id/profile')
  async profile(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.insights.tenantProfile(id) };
  }

  @Get('tenants/:id/branches')
  async branches(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.assertTenantExists(id);
    return { success: true, data: await this.insights.tenantBranches(id) };
  }

  @Post('tenants/:id/users/:userId/revoke-sessions')
  async revokeUserSessions(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string
  ) {
    await this.service.revokeTenantUserSessions(id, userId, req.masterAdmin.email, ip);
    return { success: true, message: 'تم تسجيل خروج المستخدم من كل الأجهزة' };
  }

  @Post('tenants/:id/users/:userId/unlock')
  async unlockUser(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string
  ) {
    await this.service.unlockTenantUser(id, userId, req.masterAdmin.email, ip);
    return { success: true, message: 'تم فك قفل المستخدم' };
  }

  @Get('plans')
  async plans() {
    return { success: true, data: await this.service.listPlans() };
  }

  @Get('features')
  async features() {
    return { success: true, data: await this.service.listFeatureCatalog() };
  }

  @Get('audit-logs')
  async audit(@Query('limit') limit?: string) {
    return { success: true, data: await this.service.auditLogs(limit ? Number(limit) : 50) };
  }

  @Patch('tenants/:id/status')
  async status(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TenantStatusDto
  ) {
    const data = await this.service.setTenantStatus(id, dto, req.masterAdmin.email, ip);
    return { success: true, data, message: 'تم تحديث حالة التاجر' };
  }

  @Put('tenants/:id/subscription')
  async subscription(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TenantSubscriptionDto
  ) {
    const data = await this.service.setTenantSubscription(id, dto, req.masterAdmin.email, ip);
    return { success: true, data, message: 'تم تحديث الاشتراك' };
  }

  @Get('tenants/:id/backup')
  async backup(@Request() req, @Ip() ip: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.backupTenant(id, req.masterAdmin.email, ip) };
  }

  @Delete('tenants/:id')
  async deleteTenant(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeleteTenantDto
  ) {
    await this.service.deleteTenant(id, body.businessName, req.masterAdmin.email, ip);
    return { success: true, message: 'تم حذف التاجر نهائياً' };
  }

  @Post('tenants/restore')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async restore(@UploadedFile() file: { buffer: Buffer }, @Request() req, @Ip() ip: string) {
    if (!file) throw new ForbiddenException('ملف النسخة الاحتياطية مطلوب');
    let backup: unknown;
    try {
      backup = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new ForbiddenException('ملف النسخة الاحتياطية ليس JSON صالحاً');
    }
    await this.service.restoreTenant(backup, req.masterAdmin.email, ip);
    return { success: true, message: 'تمت استعادة التاجر بنجاح' };
  }

  @Put('tenants/:id/limits')
  async limits(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TenantLimitsDto
  ) {
    const data = await this.service.setTenantLimits(id, dto, req.masterAdmin.email, ip);
    return { success: true, data, message: 'تم تحديث حدود الحساب' };
  }

  @Get('tenants/:id/usage')
  async usage(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.tenantUsage(id) };
  }

  /** سجل الأمان والنشاط الحساس للتاجر (دخول، فشل دخول، مستخدمين، صلاحيات، مفاتيح API...). */
  @Get('tenants/:id/audit-logs')
  async tenantAudit(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string
  ) {
    await this.service.assertTenantExists(id);
    return {
      success: true,
      data: await this.auditService.listForTenant(id, { limit: Number(limit) || 100, action }),
    };
  }

  @Get('tenants/:id/users')
  async users(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.listTenantUsers(id) };
  }

  @Post('tenants/:id/reset-user-password')
  async resetPassword(
    @Request() req,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetTenantUserPasswordDto
  ) {
    await this.service.resetTenantUserPassword(
      id,
      dto.userId,
      dto.newPassword,
      req.masterAdmin.email,
      ip
    );
    return { success: true, message: 'تم تغيير كلمة مرور المستخدم' };
  }
}
