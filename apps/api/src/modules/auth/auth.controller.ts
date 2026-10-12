import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  Response,
  Query,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  authCookieOptions,
  durationToMilliseconds,
} from '@/common/utils/auth-cookies';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Get('csrf')
  csrf(@Request() req: any, @Response({ passthrough: true }) res: ExpressResponse) {
    const token = req.cookies?.[CSRF_TOKEN_COOKIE] || randomBytes(32).toString('base64url');
    res.cookie(
      CSRF_TOKEN_COOKIE,
      token,
      authCookieOptions(this.config, {
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
    );
    return { success: true, data: { csrfToken: token } };
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Request() req: any,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Query('tenantId') tenantId: string
  ) {
    // في الإنتاج يُفضّل حلّ tenantId من نطاق المتجر أو شاشة اختيار مخصصة.
    if (!tenantId) throw new BadRequestException('معرّف المتجر مطلوب');
    const result = await this.authService.login(dto, tenantId, req.ip);
    const accessMaxAge = durationToMilliseconds(
      this.config.get('JWT_ACCESS_EXPIRATION') || '15m',
      15 * 60 * 1000
    );
    const refreshMaxAge = durationToMilliseconds(
      this.config.get('JWT_REFRESH_EXPIRATION') || '7d',
      7 * 24 * 60 * 60 * 1000
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      authCookieOptions(this.config, { maxAge: accessMaxAge })
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      authCookieOptions(this.config, { path: '/api/v1/auth', maxAge: refreshMaxAge })
    );

    // لا نرجع JWT إلى JavaScript؛ المتصفح يحفظه في HttpOnly cookies.
    const { user, tenant } = result;
    return { success: true, data: { user, tenant }, message: 'تم تسجيل الدخول بنجاح' };
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Request() req: any,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || dto?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('جلسة الدخول غير موجودة');

    try {
      const result = await this.authService.refresh(refreshToken);
      const accessMaxAge = durationToMilliseconds(
        this.config.get('JWT_ACCESS_EXPIRATION') || '15m',
        15 * 60 * 1000
      );
      res.cookie(
        ACCESS_TOKEN_COOKIE,
        result.accessToken,
        authCookieOptions(this.config, { maxAge: accessMaxAge })
      );
      return { success: true, data: { refreshed: true } };
    } catch (error) {
      this.clearAuthCookies(res);
      throw error;
    }
  }

  @Post('logout')
  async logout(@Response({ passthrough: true }) res: ExpressResponse) {
    this.clearAuthCookies(res);
    return { success: true, message: 'تم تسجيل الخروج بنجاح' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@Request() req: any) {
    return { success: true, data: req.user };
  }

  private clearAuthCookies(res: ExpressResponse) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, authCookieOptions(this.config));
    res.clearCookie(REFRESH_TOKEN_COOKIE, authCookieOptions(this.config, { path: '/api/v1/auth' }));
  }
}
