import { Body, Controller, Post, Get, UseGuards, Request, Ip, Query, BadRequestException } from '@nestjs/common';
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
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Query('tenantId') tenantId: string) {
    // In production, resolve tenantId from subdomain, a tenant-select step,
    // or a dedicated per-tenant login URL rather than a query param.
    if (!tenantId) throw new BadRequestException('معرّف المتجر مطلوب');
    const result = await this.authService.login(dto, tenantId, ip);
    return { success: true, data: result, message: 'تم تسجيل الدخول بنجاح' };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken);
    return { success: true, data: result };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout() {
    // Token revocation list can be added once refresh tokens are persisted (Phase 2 hardening).
    return { success: true, message: 'تم تسجيل الخروج بنجاح' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@Request() req: any) {
    return { success: true, data: req.user };
  }
}
