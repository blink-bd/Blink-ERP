import {
  IsString,
  IsEmail,
  IsOptional,
  Length,
  IsDateString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** يتأكد إن المنطقة الزمنية اسم IANA حقيقي (مثل Africa/Cairo) — بتتستخدم في SQL التقارير. */
@ValidatorConstraint({ name: 'isIanaTimezone' })
export class IsIanaTimezone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(value))
      return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'المنطقة الزمنية غير صحيحة (مثال: Africa/Cairo)';
  }
}

class AdminUserDto {
  @ApiProperty()
  @IsString()
  @Length(2, 255)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @Length(8, 100)
  password: string;
}

export class CreateTenantDto {
  @ApiProperty({ example: 'متجر الإكسسوارات' })
  @IsString()
  @Length(2, 255)
  businessName: string;

  @ApiProperty({ example: 'متجر الإكسسوارات' })
  @IsString()
  @Length(2, 255)
  businessNameAr: string;

  @ApiPropertyOptional({ example: 'Accessories Store' })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  businessNameEn?: string;

  @ApiProperty({ example: 'merchant@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+966500000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Egypt' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  country?: string;

  @ApiPropertyOptional({ example: 'EGP', description: 'كود العملة ISO-4217' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'كود العملة لازم 3 حروف إنجليزية كبيرة مثل EGP' })
  currency?: string;

  @ApiPropertyOptional({ example: 'Africa/Cairo' })
  @IsOptional()
  @IsString()
  @Validate(IsIanaTimezone)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  subscriptionStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  subscriptionEndDate?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AdminUserDto)
  adminUser: AdminUserDto;
}
