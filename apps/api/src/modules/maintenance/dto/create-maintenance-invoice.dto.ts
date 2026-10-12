import { Type } from 'class-transformer';
import { IsEmail, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMaintenanceInvoiceDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @MaxLength(255)
  customerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @IsString()
  @MaxLength(500)
  productName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productSerial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  productNotes?: string;

  @IsString()
  @MaxLength(10000)
  maintenanceDescription: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  partsDescription?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  partsCost: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  servicePrice: number;
}
