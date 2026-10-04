import { IsString, IsOptional, IsNumber, IsUUID, IsBoolean, Min, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'كفر أيفون 14 برو' })
  @IsString()
  @Length(1, 500)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiProperty({ example: 15.0 })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ example: 35.0 })
  @IsNumber()
  @Min(0.01)
  sellingPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  wholesalePrice?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  minStockLevel?: number;

  @ApiPropertyOptional({ example: 'piece' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'كمية افتتاحية تُضاف للمخزون عند إنشاء المنتج' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialQuantity?: number;

  @ApiPropertyOptional({ description: 'المخزن اللي هتتضاف فيه الكمية الافتتاحية (افتراضي: المخزن الرئيسي)' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  /** يستخدم عند تعديل كمية الافتتاح، ولا يسمح الخادم بالتعديل بدون تأكيد وسبب. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmOpeningQuantityChange?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openingQuantityReason?: string;

  /** تأكيد مراجعة أسعار البيع بعد تغيّر سعر التكلفة. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmPriceReview?: boolean;
}
