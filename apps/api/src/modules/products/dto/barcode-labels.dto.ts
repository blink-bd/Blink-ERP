import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BarcodeLabelItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) @Max(500) copies: number;
}

export class BarcodeLabelsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BarcodeLabelItemDto)
  items: BarcodeLabelItemDto[];
}
