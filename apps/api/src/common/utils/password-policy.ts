import { BadRequestException } from '@nestjs/common';

export function assertStrongPassword(password: string): void {
  const errors: string[] = [];
  if (!password || password.length < 8) errors.push('8 أحرف على الأقل');
  if (password && password.length > 128) errors.push('128 حرف كحد أقصى');
  if (!/[A-Z]/.test(password || '')) errors.push('حرف كبير واحد على الأقل');
  if (!/[a-z]/.test(password || '')) errors.push('حرف صغير واحد على الأقل');
  if (!/[0-9]/.test(password || '')) errors.push('رقم واحد على الأقل');
  if (!/[^A-Za-z0-9]/.test(password || '')) errors.push('رمز خاص واحد على الأقل');
  if (errors.length) {
    throw new BadRequestException(`كلمة المرور ضعيفة: ${errors.join('، ')}`);
  }
}
