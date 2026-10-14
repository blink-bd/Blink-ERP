import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { MasterAdminGuard } from '@/modules/master-admin/master-admin.guard';
import { BranchesService } from './branches.service';
import { WarehousesService } from './warehouses.service';
import {
  BranchDto,
  LinkWarehouseBranchDto,
  UpdateBranchDto,
  UpdateWarehouseDto,
  WarehouseDto,
} from './dto/location.dto';

/**
 * إنشاء الفروع والمخازن وربطها ببعض = صلاحية المدير العام فقط.
 * التاجر بيستخدم الفروع والمخازن الجاهزة في البيع والشراء والتحويلات، لكن ماينشئهاش
 * ولا يربطها — عشان شكل الحساب (عدد الفروع/المخازن) يفضل تحت سيطرة الإدارة.
 */
@ApiTags('admin-locations')
@ApiBearerAuth()
@Controller({ path: 'admin/tenants/:tenantId', version: '1' })
@UseGuards(MasterAdminGuard)
export class AdminLocationsController {
  constructor(
    private readonly branches: BranchesService,
    private readonly warehouses: WarehousesService,
    private readonly audit: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  private async assertTenant(tenantId: string): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (!rows.length) throw new NotFoundException('التاجر غير موجود');
  }

  /** كل إجراء بيعمله المدير العام في فروع/مخازن تاجر بيتسجل في سجل النشاط. */
  private log(req: any, tenantId: string, action: string, entityType: string, detail: string) {
    void this.audit.log({
      tenantId,
      userId: null,
      userEmail: `master-admin:${req.masterAdmin?.email || 'unknown'}`,
      ip: req.ip || null,
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 500) || null,
      action,
      entityType,
      entityId: null,
      newValues: { detail },
      severity: 'info',
    });
  }

  @Get('branches')
  async listBranches(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await this.assertTenant(tenantId);
    return { success: true, data: await this.branches.findAll(tenantId) };
  }

  @Get('warehouses')
  async listWarehouses(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await this.assertTenant(tenantId);
    // includeAll = true: المدير العام بيشوف كل المخازن حتى الموقوفة.
    return { success: true, data: await this.warehouses.findAll(tenantId, true) };
  }

  @Post('branches')
  async createBranch(
    @Request() req,
    @Ip() ip: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: BranchDto
  ) {
    await this.assertTenant(tenantId);
    const branch = await this.branches.create(tenantId, dto);
    this.log(req, tenantId, 'ADMIN_BRANCH_CREATED', 'branch', `إنشاء فرع «${branch.name}»`);
    return { success: true, data: branch, message: 'تم إنشاء الفرع' };
  }

  @Put('branches/:id')
  async updateBranch(
    @Request() req,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto
  ) {
    await this.assertTenant(tenantId);
    const branch = await this.branches.update(tenantId, id, dto);
    this.log(req, tenantId, 'ADMIN_BRANCH_UPDATED', 'branch', `تعديل فرع «${branch.name}»`);
    return { success: true, data: branch, message: 'تم تحديث الفرع' };
  }

  @Post('warehouses')
  async createWarehouse(
    @Request() req,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: WarehouseDto
  ) {
    await this.assertTenant(tenantId);
    const warehouse = await this.warehouses.create(tenantId, dto);
    this.log(
      req,
      tenantId,
      'ADMIN_WAREHOUSE_CREATED',
      'warehouse',
      `إنشاء مخزن «${warehouse.name}»`
    );
    return { success: true, data: warehouse, message: 'تم إنشاء المخزن' };
  }

  /** تغيير الفرع الأساسي للمخزن (أو اسمه/حالته). */
  @Put('warehouses/:id')
  async updateWarehouse(
    @Request() req,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto
  ) {
    await this.assertTenant(tenantId);
    const warehouse = await this.warehouses.update(tenantId, id, dto);
    this.log(
      req,
      tenantId,
      'ADMIN_WAREHOUSE_UPDATED',
      'warehouse',
      `تعديل مخزن «${warehouse.name}»`
    );
    return { success: true, data: warehouse, message: 'تم تحديث المخزن' };
  }

  /** فرع يستخدم مخزن موجود — حتى لو المخزن تابع لفرع تاني (مخزن مشترك). */
  @Post('warehouses/:id/branches')
  async linkBranch(
    @Request() req,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkWarehouseBranchDto
  ) {
    await this.assertTenant(tenantId);
    const warehouse = await this.warehouses.linkBranch(tenantId, id, dto.branchId);
    const branch = await this.branches.findById(tenantId, dto.branchId);
    this.log(
      req,
      tenantId,
      'ADMIN_WAREHOUSE_LINKED',
      'warehouse',
      `ربط فرع «${branch.name}» بمخزن «${warehouse.name}»`
    );
    return { success: true, data: warehouse, message: 'تم ربط الفرع بالمخزن' };
  }

  @Delete('warehouses/:id/branches/:branchId')
  async unlinkBranch(
    @Request() req,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string
  ) {
    await this.assertTenant(tenantId);
    const warehouse = await this.warehouses.unlinkBranch(tenantId, id, branchId);
    this.log(
      req,
      tenantId,
      'ADMIN_WAREHOUSE_UNLINKED',
      'warehouse',
      `فك ربط فرع من مخزن «${warehouse.name}»`
    );
    return { success: true, data: warehouse, message: 'تم فك ربط الفرع من المخزن' };
  }
}
