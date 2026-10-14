import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ahmed_store' })
  @IsString()
  @Length(3, 50)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'اسم المستخدم حروف إنجليزية وأرقام و . _ - فقط' })
  username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @Length(8, 100)
  password: string;
}
