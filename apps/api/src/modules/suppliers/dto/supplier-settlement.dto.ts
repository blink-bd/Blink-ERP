import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SupplierSettlementDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsString() method: string;
  @IsOptional() @IsString() notes?: string;
}
