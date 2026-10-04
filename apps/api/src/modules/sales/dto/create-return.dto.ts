import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemInputDto {
  @IsUUID() saleItemId: string;
  @IsNumber() @Min(0.0001) quantity: number;
}

export class CreateReturnDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInputDto)
  items: ReturnItemInputDto[];

  @IsOptional() @IsString() reason?: string;
}
