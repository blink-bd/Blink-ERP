import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Put,
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
import { MasterAdminService } from './master-admin.service';
import { MasterAdminGuard } from './master-admin.guard';
import {
  MasterChangePasswordDto,
  MasterLoginDto,
  ResetTenantUserPasswordDto,
  TenantStatusDto,
  TenantSubscriptionDto,
} from './dto/master-admin.dto';

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
    const result = await this.service.login(dto.email, dto.password, ip);
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
  logout(@Response({ passthrough: true }) res: ExpressResponse) {
    res.clearCookie(MASTER_TOKEN_COOKIE, authCookieOptions(this.config, { path: '/api/v1/admin' }));
    return { success: true, message: 'تم تسجيل الخروج' };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  me(@Request() req) {
    return { success: true, data: req.masterAdmin };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(MasterAdminGuard)
  async changePassword(@Request() req, @Body() dto: MasterChangePasswordDto) {
    await this.service.changePassword(req.masterAdmin.id, dto.currentPassword, dto.newPassword);
    return { success: true, message: 'تم تغيير كلمة المرور' };
  }
}

@ApiTags('master-admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
@UseGuards(MasterAdminGuard)
export class MasterAdminController {
  constructor(private readonly service: MasterAdminService) {}

  @Get('dashboard')
  async dashboard() {
    return { success: true, data: await this.service.dashboard() };
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
    @Param('id') id: string,
    @Body() dto: TenantStatusDto
  ) {
    const data = await this.service.setTenantStatus(id, dto, req.masterAdmin.email, ip);
    return { success: true, data, message: 'تم تحديث حالة التاجر' };
  }

  @Put('tenants/:id/subscription')
  async subscription(
    @Request() req,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() dto: TenantSubscriptionDto
  ) {
    const data = await this.service.setTenantSubscription(id, dto, req.masterAdmin.email, ip);
    return { success: true, data, message: 'تم تحديث الاشتراك' };
  }

  @Get('tenants/:id/users')
  async users(@Param('id') id: string) {
    return { success: true, data: await this.service.listTenantUsers(id) };
  }

  @Post('tenants/:id/reset-user-password')
  async resetPassword(
    @Request() req,
    @Ip() ip: string,
    @Param('id') id: string,
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
