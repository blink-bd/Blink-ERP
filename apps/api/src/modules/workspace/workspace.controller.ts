import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { AccessScopeService } from '@/modules/users/access-scope.service';
import { UsersService } from '@/modules/users/users.service';
import { FeaturesService } from '@/modules/features/features.service';
import { warehouseBranchIds, warehouseServesBranch } from '@/common/utils/access-scope';

export class SetWorkspaceDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() branchId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() warehouseId?: string | null;
}

/**
 * «فرع العمل»: المستخدم بيختار السيستم يشتغل على أنهي فرع/مخزن، أو يعرض الكل.
 * الاختيار بيتحفظ على المستخدم في قاعدة البيانات وبيتطبق على كل الصفحات
 * (لوحة التحكم، نقطة البيع، المبيعات، المخزون، المشتريات، المصروفات، الخزينة، التقارير).
 */
@ApiTags('workspace')
@ApiBearerAuth()
@NoApiKey()
@Controller({ path: 'workspace', version: '1' })
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class WorkspaceController {
  constructor(
    private readonly accessScope: AccessScopeService,
    private readonly usersService: UsersService,
    private readonly featuresService: FeaturesService
  ) {}

  private async locations(tenantId: string) {
    const { branches, warehouses } = await this.accessScope.listTenantLocations(tenantId);
    const [multiBranch, multiWarehouse] = await Promise.all([
      this.featuresService.tenantHasFeature(tenantId, 'branches'),
      this.featuresService.tenantHasFeature(tenantId, 'warehouses'),
    ]);
    // نفس قاعدة /warehouses: من غير ميزة «المخازن المتعددة» المخزن الرئيسي بس هو اللي يتستخدم.
    const usableWarehouses = multiWarehouse ? warehouses : warehouses.filter((w) => w.isMain);
    return { branches, warehouses, usableWarehouses, multiBranch, multiWarehouse };
  }

  private async build(req: any) {
    const tenantId: string = req.tenantId;
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new ForbiddenException();
    const { branches, warehouses, usableWarehouses, multiBranch, multiWarehouse } =
      await this.locations(tenantId);
    const scope = this.accessScope.compute(user, branches, warehouses);

    const allowedBranches = branches.filter(
      (b) =>
        (b.isActive || b.id === scope.activeBranchId) &&
        (!scope.allowedBranchIds || scope.allowedBranchIds.includes(b.id))
    );
    const allowedWarehouses = usableWarehouses.filter(
      (w) =>
        (w.isActive || w.id === scope.activeWarehouseId) &&
        (!scope.allowedWarehouseIds || scope.allowedWarehouseIds.includes(w.id))
    );

    const activeBranch = branches.find((b) => b.id === scope.activeBranchId) || null;
    const activeWarehouse = warehouses.find((w) => w.id === scope.activeWarehouseId) || null;

    return {
      isOwner: scope.isOwner,
      accessAll: scope.accessAll,
      activeBranchId: scope.activeBranchId,
      activeWarehouseId: scope.activeWarehouseId,
      activeBranchName: activeBranch?.name || null,
      activeWarehouseName: activeWarehouse?.name || null,
      mainBranchId: scope.mainBranchId,
      defaultBranchId: user.branchId || null,
      defaultWarehouseId: user.warehouseId || null,
      effectiveBranchIds: scope.branchIds,
      effectiveWarehouseIds: scope.warehouseIds,
      branches: allowedBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        city: b.city,
        isMain: b.isMain,
        isActive: b.isActive,
      })),
      warehouses: allowedWarehouses.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.code,
        branchId: w.branchId || null,
        // كل الفروع اللي بتستخدم المخزن (الأساسي + المشتركة)
        branchIds: warehouseBranchIds(w),
        isMain: w.isMain,
        isActive: w.isActive,
      })),
      // صفحة «فرع العمل» بتظهر في القائمة لما يبقى فيه أكتر من فرع أو أكتر من مخزن
      showSelector: allowedBranches.length > 1 || allowedWarehouses.length > 1,
      features: { branches: multiBranch, warehouses: multiWarehouse },
    };
  }

  @Get()
  async get(@Request() req) {
    return { success: true, data: await this.build(req) };
  }

  @Put()
  async set(@Request() req, @Body() dto: SetWorkspaceDto) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new ForbiddenException();
    const { branches, warehouses, usableWarehouses } = await this.locations(req.tenantId);
    // النطاق المسموح (من غير اعتبار للاختيار الحالي)
    const base = this.accessScope.compute(
      { ...user, activeBranchId: null, activeWarehouseId: null },
      branches,
      warehouses
    );

    const branchId = dto.branchId || null;
    const warehouseId = dto.warehouseId || null;

    if (branchId) {
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) throw new BadRequestException('الفرع غير موجود');
      if (!branch.isActive) throw new BadRequestException('الفرع ده موقوف');
      if (base.allowedBranchIds && !base.allowedBranchIds.includes(branchId)) {
        throw new ForbiddenException('مش مسموح لك تشتغل على الفرع ده');
      }
    }
    if (warehouseId) {
      const w = usableWarehouses.find((x) => x.id === warehouseId);
      if (!w) throw new BadRequestException('المخزن غير موجود أو غير متاح');
      if (!w.isActive) throw new BadRequestException('المخزن ده موقوف');
      if (base.allowedWarehouseIds && !base.allowedWarehouseIds.includes(warehouseId)) {
        throw new ForbiddenException('مش مسموح لك تشتغل على المخزن ده');
      }
      if (branchId && !warehouseServesBranch(w, branchId)) {
        throw new BadRequestException('المخزن ده تابع لفرع تاني');
      }
    }

    await this.usersService.setActiveLocation(user.id, branchId, warehouseId);
    return { success: true, data: await this.build(req), message: 'تم تغيير فرع العمل' };
  }
}
