import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CustomerPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsUUID() methodId: string;
  @IsOptional() @IsString() notes?: string;
}
