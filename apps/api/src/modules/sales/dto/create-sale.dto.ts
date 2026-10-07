import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaleItemInputDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsNumber() @Min(0.0001) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @ApiPropertyOptional({ enum: ['retail', 'half_wholesale', 'wholesale'] })
  @IsOptional()
  @IsString()
  priceTier?: 'retail' | 'half_wholesale' | 'wholesale';
}

export class SalePaymentInputDto {
  @ApiProperty() @IsUUID() methodId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceNumber?: string;
}

export class AddSalePaymentDto {
  @ApiProperty() @IsUUID() methodId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceNumber?: string;
}

export class VoidSaleDto {
  @ApiProperty() @IsString() @MinLength(3) reason: string;
}

export class CreateSaleDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiProperty() @IsUUID() warehouseId: string;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountAmount?: number;

  @ApiPropertyOptional({ type: [SalePaymentInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments?: SalePaymentInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
