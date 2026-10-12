import {
  IsArray,
  IsIn,
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

  /**
   * الجزء المدفوع من قيمة المرتجع (لو الفاتورة كانت متحصّلة):
   * - refund: يترد للعميل فلوس بطريقة الدفع refundMethodId (الافتراضي: طريقة دفع الفاتورة).
   * - account: يتضاف رصيد لحساب العميل (لازم الفاتورة تكون على عميل).
   * الجزء الآجل من الفاتورة بيتخصم دايماً من المتبقي عليها.
   */
  @IsOptional() @IsIn(['refund', 'account']) refundMode?: 'refund' | 'account';

  @IsOptional() @IsUUID() refundMethodId?: string;
}
