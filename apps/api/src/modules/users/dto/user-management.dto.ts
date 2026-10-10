import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateTenantUserDto {
  @IsEmail() @Length(3, 255) email: string;
  @IsString() @Length(2, 255) fullName: string;
  @IsOptional() @IsString() @Length(0, 50) phone?: string;
  @IsString() @Length(8, 128) password: string;
  @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) roleIds: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() branchId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() warehouseId?: string | null;
}

export class UpdateTenantUserDto {
  @IsOptional() @IsString() @Length(2, 255) fullName?: string;
  @IsOptional() @IsString() @Length(0, 50) phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) roleIds?: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() branchId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() warehouseId?: string | null;
}

export class ResetUserPasswordDto {
  @IsString() @Length(8, 128) newPassword: string;
}

export class ChangeOwnPasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(8, 128) newPassword: string;
}

export class RoleDto {
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9_\-]+$/i, { message: 'الاسم البرمجي: حروف إنجليزية وأرقام و _ فقط' })
  name: string;
  @IsString() @Length(2, 100) nameAr: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(2, 100) nameAr?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) permissions?: string[];
}
