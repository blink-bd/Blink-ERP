import { ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { WEBHOOK_EVENTS } from '../webhook-events';

export class CreateWebhookDto {
  @IsString()
  @MaxLength(2048)
  url: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events: string[];
}
