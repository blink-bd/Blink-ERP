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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
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
  constructor(private readonly service: MasterAdminService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: MasterLoginDto, @Ip() ip: string) {
    return { success: true, data: await this.service.login(dto.email, dto.password, ip) };
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

  @Get('tenants/:id/backup')
  async backup(@Request() req, @Ip() ip: string, @Param('id') id: string) {
    return { success: true, data: await this.service.backupTenant(id, req.masterAdmin.email, ip) };
  }

  @Delete('tenants/:id')
  async deleteTenant(
    @Request() req,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() body: { businessName: string }
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
