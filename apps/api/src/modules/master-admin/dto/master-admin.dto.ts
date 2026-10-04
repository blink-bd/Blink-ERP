import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class MasterLoginDto {
  @IsEmail() email: string;
  @IsString() @Length(1, 128) password: string;
}

export class MasterChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(8, 128) newPassword: string;
}

export class TenantStatusDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['active', 'suspended', 'cancelled', 'expired']) subscriptionStatus?: string;
}

export class TenantSubscriptionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsDateString() subscriptionStartDate?: string;
  @IsOptional() @IsDateString() subscriptionEndDate?: string;
}

export class ResetTenantUserPasswordDto {
  @IsUUID() userId: string;
  @IsString() @Length(8, 128) newPassword: string;
}
