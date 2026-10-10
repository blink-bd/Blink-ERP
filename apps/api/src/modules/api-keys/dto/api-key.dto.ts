import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { API_KEY_GRANTABLE_PERMISSIONS } from '../api-keys.constants';

export class CreateApiKeyDto {
  @IsString() @Length(2, 100) name: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(API_KEY_GRANTABLE_PERMISSIONS.length)
  @IsIn(API_KEY_GRANTABLE_PERMISSIONS as unknown as string[], { each: true })
  permissions: string[];

  @IsOptional() @IsDateString() expiresAt?: string;
}
