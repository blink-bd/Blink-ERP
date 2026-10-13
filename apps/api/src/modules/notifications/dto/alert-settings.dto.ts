import { Transform } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateAlertSettingsDto {
  /** واتساب التاجر لاستقبال التنبيهات — فاضي = إيقاف التنبيهات على الواتساب. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d\s\-()٠-٩]{7,30}$/, { message: 'رقم الواتساب غير صحيح' })
  alertWhatsapp?: string | null;

  /** إيميل التاجر لاستقبال التنبيهات — فاضي = إيقاف التنبيهات على الإيميل. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail({}, { message: 'الإيميل غير صحيح' })
  @MaxLength(255)
  alertEmail?: string | null;

  /** { sales: true, low_stock: false, ... } */
  @IsOptional()
  @IsObject()
  alertEvents?: Record<string, boolean>;
}
