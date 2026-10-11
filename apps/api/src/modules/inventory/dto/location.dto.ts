import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class BranchDto {
  @IsString() @Length(1, 255) name: string;
  @IsOptional() @IsString() @Length(0, 50) code?: string;
  @IsOptional() @IsString() @Length(0, 50) phone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @IsString() @Length(0, 100) city?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() @Length(1, 255) name?: string;
  @IsOptional() @IsString() @Length(0, 50) code?: string;
  @IsOptional() @IsString() @Length(0, 50) phone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @IsString() @Length(0, 100) city?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WarehouseDto {
  @IsString() @Length(1, 255) name: string;
  @IsOptional() @IsString() @Length(0, 50) code?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() branchId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @Length(1, 255) name?: string;
  @IsOptional() @IsString() @Length(0, 50) code?: string;
  @IsOptional() @IsString() @Length(0, 1000) address?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() branchId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
