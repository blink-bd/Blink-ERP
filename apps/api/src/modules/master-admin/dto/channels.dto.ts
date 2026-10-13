import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EMAIL_PROVIDERS, EmailProvider } from '@/modules/notifications/notification-channels';

class EmailChannelDto {
  @IsIn(EMAIL_PROVIDERS) provider: EmailProvider;

  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @IsEmail({}, { message: 'إيميل المرسل غير صحيح' })
  fromEmail?: string;

  @IsOptional() @IsString() @MaxLength(80) fromName?: string;
  @IsOptional() @IsString() @MaxLength(255) smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() @MaxLength(255) smtpUser?: string;
  /** فاضي = سيب القيمة المحفوظة زي ما هي. */
  @IsOptional() @IsString() @MaxLength(500) smtpPassword?: string;
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
}

class WhatsAppChannelDto {
  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(/^\d{5,30}$/, { message: 'Phone Number ID أرقام بس' })
  phoneNumberId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(/^v\d{1,3}\.\d$/, { message: 'إصدار Graph API بالشكل v23.0' })
  apiVersion?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(/^[a-z0-9_]{1,512}$/, { message: 'اسم القالب حروف إنجليزي صغيرة وأرقام و _ بس' })
  templateName?: string;

  @IsOptional() @IsString() @MaxLength(15) templateLanguage?: string;
  /** فاضي = سيب التوكن المحفوظ زي ما هو. */
  @IsOptional() @IsString() @MaxLength(1000) accessToken?: string;
}

class OperatorRecipientsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @IsEmail({}, { message: 'إيميل الإدارة غير صحيح' })
  email?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(/^\+?\d{8,15}$/, { message: 'رقم واتساب الإدارة بالصيغة الدولية مثل +201xxxxxxxxx' })
  whatsapp?: string;
}

export class UpdateChannelsDto {
  @IsOptional() @ValidateNested() @Type(() => EmailChannelDto) email?: EmailChannelDto;
  @IsOptional() @ValidateNested() @Type(() => WhatsAppChannelDto) whatsapp?: WhatsAppChannelDto;
  @IsOptional() @ValidateNested() @Type(() => OperatorRecipientsDto) operator?: OperatorRecipientsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['smtpPassword', 'emailApiKey', 'whatsappToken'], { each: true })
  clearSecrets?: string[];
}

export class TestChannelsDto {
  @IsOptional() @IsEmail({}, { message: 'الإيميل غير صحيح' }) email?: string;

  @IsOptional()
  @Matches(/^\+?\d{8,15}$/, { message: 'الرقم بالصيغة الدولية مثل +201xxxxxxxxx' })
  whatsapp?: string;
}
