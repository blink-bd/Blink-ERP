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
  Ip,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { NoApiKey } from '@/common/decorators/no-api-key.decorator';
import { ChangeOwnPasswordDto } from '@/modules/users/dto/user-management.dto';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  authCookieOptions,
  durationToMilliseconds,
} from '@/common/utils/auth-cookies';
import { randomBytes } from 'node:crypto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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
    @Ip() ip: string,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Query('tenantId') tenantId: string | undefined,
    @Headers('user-agent') userAgent?: string
  ) {
    // معرّف المتجر اختياري: لو البريد مسجل في متجر واحد نشط يتم تحديده تلقائياً.
    const providedTenantId = tenantId?.trim();
    if (providedTenantId && !isUUID(providedTenantId)) {
      throw new BadRequestException('معرّف المتجر غير صحيح');
    }
    const result = await this.authService.login(dto, providedTenantId || null, ip, {
      userAgent: String(userAgent || '').slice(0, 500),
    });
    this.setAuthCookies(res, result);
    // JWT values are intentionally kept out of the JSON response.
    return {
      success: true,
      data: { user: result.user, tenant: result.tenant },
      message: 'تم تسجيل الدخول بنجاح',
    };
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
    @Headers('user-agent') userAgent: string | undefined,
    @Response({ passthrough: true }) res: ExpressResponse
  ) {
    const result = await this.authService.changeOwnPassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
      { ip, userAgent: String(userAgent || '').slice(0, 500) }
    );
    this.setAuthCookies(res, result);
    return {
      success: true,
      data: { user: result.user, tenant: result.tenant },
      message: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى',
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async refresh(@Request() req: any, @Response({ passthrough: true }) res: ExpressResponse) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('جلسة الدخول غير موجودة');
    try {
      const result = await this.authService.refresh(refreshToken);
      res.cookie(
        ACCESS_TOKEN_COOKIE,
        result.accessToken,
        authCookieOptions(this.config, {
          maxAge: durationToMilliseconds(
            this.config.get('JWT_ACCESS_EXPIRATION') || '15m',
            15 * 60 * 1000
          ),
        })
      );
      return { success: true, data: { refreshed: true } };
    } catch (error) {
      this.clearAuthCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @NoApiKey()
  @ApiBearerAuth()
  async logout(@Request() req: any, @Response({ passthrough: true }) res: ExpressResponse) {
    await this.authService.logout(req.user.id);
    this.clearAuthCookies(res);
    return { success: true, message: 'تم تسجيل الخروج بنجاح' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @NoApiKey()
  @ApiBearerAuth()
  async me(@Request() req: any) {
    return { success: true, data: req.user };
  }

  private setAuthCookies(
    res: ExpressResponse,
    result: { accessToken: string; refreshToken: string }
  ) {
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      authCookieOptions(this.config, {
        maxAge: durationToMilliseconds(
          this.config.get('JWT_ACCESS_EXPIRATION') || '15m',
          15 * 60 * 1000
        ),
      })
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      authCookieOptions(this.config, {
        path: '/api/v1/auth',
        maxAge: durationToMilliseconds(
          this.config.get('JWT_REFRESH_EXPIRATION') || '7d',
          7 * 24 * 60 * 60 * 1000
        ),
      })
    );
  }

  private clearAuthCookies(res: ExpressResponse) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, authCookieOptions(this.config));
    res.clearCookie(REFRESH_TOKEN_COOKIE, authCookieOptions(this.config, { path: '/api/v1/auth' }));
    res.clearCookie(CSRF_TOKEN_COOKIE, authCookieOptions(this.config, { httpOnly: false }));
  }
}
