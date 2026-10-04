import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '@/modules/auth/guards/tenant-context.guard';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { RequireFeature } from '@/common/decorators/require-feature.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('products')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
@RequireFeature('products')
@UseGuards(JwtAuthGuard, TenantContextGuard, FeaturesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('isActive') isActive?: string
  ) {
    const result = await this.productsService.findAll(req.tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      categoryId,
      brandId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('check-identifiers')
  async checkIdentifiers(
    @Request() req,
    @Query('sku') sku?: string,
    @Query('barcode') barcode?: string,
    @Query('excludeId') excludeId?: string
  ) {
    return {
      success: true,
      data: await this.productsService.checkIdentifiers(req.tenantId, sku, barcode, excludeId),
    };
  }

  @Get('search/:code')
  async searchByCode(@Request() req, @Param('code') code: string) {
    const product = await this.productsService.findByBarcodeOrSku(req.tenantId, code);
    if (!product) {
      return { success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' } };
    }
    return { success: true, data: product };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const product = await this.productsService.findById(req.tenantId, id);
    return { success: true, data: product };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateProductDto) {
    const product = await this.productsService.create(req.tenantId, dto, req.user?.id);
    return { success: true, data: product, message: 'تم إضافة المنتج بنجاح' };
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.productsService.update(req.tenantId, id, dto, req.user?.id);
    return { success: true, data: product, message: 'تم تحديث المنتج بنجاح' };
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.productsService.delete(req.tenantId, id);
    return { success: true, message: 'تم حذف المنتج بنجاح' };
  }
}
