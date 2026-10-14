import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnedProductInputDto {
  @IsString()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0.0001)
  sellingPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;
}

export class ResolveReturnItemDto {
  /**
   * - supplier  : يرجع للمورد ويتخصم من رصيده.
   * - restocked : يدخل المخزن كصنف جديد مستقل (مستعمل/مفتوح) بكود وسعر جديد.
   * - original  : يرجع المخزن على نفس الصنف الأصلي (سليم) بنفس تكلفته.
   * - write_off : هالك/إتلاف كامل — الكمية تخرج من المخزون وقيمتها (التكلفة الأصلية ×
   *   الكمية) تتسجل خسارة في خطوة واحدة. مفيش صنف جديد ولا تكلفة صيانة ولا هالك يدوي.
   */
  @IsIn(['supplier', 'restocked', 'original', 'write_off'])
  disposition: 'supplier' | 'restocked' | 'original' | 'write_off';

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** تكلفة صيانة الصنف المرتجع — بتتسجل فاتورة صيانة داخلية في «إدارة الصيانة». */
  @IsOptional()
  @IsNumber()
  @Min(0)
  repairExpense?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  repairDescription?: string;

  /** هالك/خسارة في الصنف المرتجع — بيتسجل مصروف «صيانة وهالك المرتجعات». */
  @IsOptional()
  @IsNumber()
  @Min(0)
  wasteExpense?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReturnedProductInputDto)
  product?: ReturnedProductInputDto;
}
