import {
  IsString,
  IsEmail,
  IsOptional,
  Length,
  IsDateString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
