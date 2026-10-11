import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  Ip,
  Query,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { ChangeOwnPasswordDto } from '@/modules/users/dto/user-management.dto';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Query('tenantId') tenantId: string,
    @Headers('user-agent') userAgent?: string
  ) {
    if (!tenantId || !isUUID(tenantId)) throw new BadRequestException('معرّف المتجر غير صحيح');
    const result = await this.authService.login(dto, tenantId, ip, {
      userAgent: String(userAgent || '').slice(0, 500),
    });
    return { success: true, data: result, message: 'تم تسجيل الدخول بنجاح' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @NoApiKey()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Request() req: any,
    @Ip() ip: string,
    @Body() dto: ChangeOwnPasswordDto,
    @Headers('user-agent') userAgent?: string
  ) {
    const data = await this.authService.changeOwnPassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
      {
        ip,
        userAgent: String(userAgent || '').slice(0, 500),
      }
    );
    return { success: true, data, message: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى' };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken);
    return { success: true, data: result };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @NoApiKey()
  @ApiBearerAuth()
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.id);
    return { success: true, message: 'تم تسجيل الخروج بنجاح' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @NoApiKey()
  @ApiBearerAuth()
  async me(@Request() req: any) {
    return { success: true, data: req.user };
  }
}
