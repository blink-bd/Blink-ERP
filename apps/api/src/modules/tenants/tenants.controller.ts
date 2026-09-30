import { Controller, Get, Post, Put, Param, Body, Ip, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { MasterAdminGuard } from '@/modules/master-admin/master-admin.guard';
import { MasterAdminService } from '@/modules/master-admin/master-admin.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller({ path: 'admin/tenants', version: '1' })
@UseGuards(MasterAdminGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly master: MasterAdminService
  ) {}

  @Get()
  async findAll() {
    return { success: true, data: await this.tenantsService.findAll() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { success: true, data: await this.tenantsService.findById(id) };
  }

  @Post()
  async create(@Request() req, @Ip() ip: string, @Body() dto: CreateTenantDto) {
    const result = await this.tenantsService.create(dto);
    await this.master.audit(req.masterAdmin.email, 'TENANT_CREATED', 'tenant', result.tenant.id,
      { businessName: dto.businessName, email: dto.email }, ip);
    return { success: true, data: result, message: 'تم إنشاء التاجر بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Ip() ip: string, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenantsService.update(id, dto);
    await this.master.audit(req.masterAdmin.email, 'TENANT_UPDATED', 'tenant', id, dto, ip);
    return { success: true, data: tenant, message: 'تم تحديث بيانات التاجر بنجاح' };
  }
}
