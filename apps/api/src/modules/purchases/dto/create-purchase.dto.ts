import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseItemDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitCost: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
}

export class CreatePurchaseDto {
  @IsUUID() supplierId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsString() supplierInvoiceNumber?: string;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsString() notes?: string;
}
