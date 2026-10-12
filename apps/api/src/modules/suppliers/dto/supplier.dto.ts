import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class SupplierDto {
  @IsString() @Length(1, 255) name: string;
  @IsOptional() @IsString() @Length(0, 50) code?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @Length(0, 50) phone?: string;
  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, v) => v !== undefined)
  @IsEmail()
  email?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @IsString() @Length(0, 100) city?: string;
  @IsOptional() @IsString() @Length(0, 255) contactPerson?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) previousBalance?: number;
  @IsOptional() @IsString() @Length(0, 50) taxNumber?: string;
  @IsOptional() @IsString() @Length(0, 255) paymentTerms?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @IsOptional() @IsString() @Length(0, 500) openingBalanceReason?: string;
}

export class UpdateSupplierDto extends PartialType(SupplierDto) {}
