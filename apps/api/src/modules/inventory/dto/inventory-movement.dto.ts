import { IsNumber, IsString, IsUUID, Length, Min } from 'class-validator';

export class AdjustInventoryDto {
  @IsUUID() productId: string;
  @IsUUID() warehouseId: string;
  @IsNumber() quantity: number;
  @IsString() @Length(2, 500) reason: string;
}

export class TransferInventoryDto {
  @IsUUID() productId: string;
  @IsUUID() fromWarehouseId: string;
  @IsUUID() toWarehouseId: string;
  @IsNumber() @Min(0.0001) quantity: number;
}
