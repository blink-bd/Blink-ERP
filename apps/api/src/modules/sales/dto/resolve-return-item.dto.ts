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
  @IsIn(['supplier', 'restocked'])
  disposition: 'supplier' | 'restocked';

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
