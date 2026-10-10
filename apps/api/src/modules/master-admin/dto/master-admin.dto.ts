import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class MasterLoginDto {
  @IsEmail() email: string;
  @IsString() @Length(1, 128) password: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) otp?: string;
}

export class MasterChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(12, 128) newPassword: string;
}

export class MasterPasswordConfirmDto {
  @IsString() @Length(1, 128) password: string;
}

export class MasterOtpDto {
  @IsString() @Matches(/^\d{6}$/) otp: string;
}

export class MasterDisable2faDto {
  @IsString() @Length(1, 128) password: string;
  @IsString() @Matches(/^\d{6}$/) otp: string;
}

export class TenantLimitsDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100000) maxUsers?:
    number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100000) maxBranches?:
    number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100000) maxWarehouses?:
    number | null;
}

export class DeleteTenantDto {
  @IsString() @Length(1, 255) businessName: string;
}

export class TenantStatusDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['active', 'suspended', 'cancelled', 'expired']) subscriptionStatus?: string;
}

export class TenantSubscriptionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsDateString() subscriptionStartDate?: string;
  @IsOptional() @IsDateString() subscriptionEndDate?: string;
  @IsOptional() @IsNumber() @Min(0) subscriptionAmount?: number;
  @IsOptional() @IsIn(['monthly', 'yearly']) subscriptionCycle?: string;
  @IsOptional() @IsString() @Length(0, 2000) subscriptionNote?: string;
}

export class ResetTenantUserPasswordDto {
  @IsUUID() userId: string;
  @IsString() @Length(8, 128) newPassword: string;
}
