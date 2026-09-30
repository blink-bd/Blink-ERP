import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@Controller({ path: 'branches', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  async findAll(@Request() req) {
    return { success: true, data: await this.branchesService.findAll(req.tenantId) };
  }

  @Post()
  async create(@Request() req, @Body() dto: any) {
    const branch = await this.branchesService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: branch, message: 'تم إضافة الفرع بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: any) {
    const branch = await this.branchesService.update(req.tenantId, id, dto);
    return { success: true, data: branch, message: 'تم تحديث الفرع بنجاح' };
  }
}
