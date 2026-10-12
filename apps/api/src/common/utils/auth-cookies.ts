import { ConfigService } from '@nestjs/config';

export const ACCESS_TOKEN_COOKIE = 'blink_access_token';
export const REFRESH_TOKEN_COOKIE = 'blink_refresh_token';
export const MASTER_TOKEN_COOKIE = 'blink_master_token';
export const CSRF_TOKEN_COOKIE = 'blink_csrf_token';

export type SameSiteMode = 'lax' | 'strict' | 'none';

export function durationToMilliseconds(
  value: string | number | undefined,
  fallback: number
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value * 1000;
  if (typeof value !== 'string') return fallback;

  const match = value.trim().match(/^(\d+)\s*(s|m|h|d|w)?$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return amount * multiplier[unit];
}

export function authCookieOptions(
  config: ConfigService,
  options: { path?: string; maxAge?: number; httpOnly?: boolean } = {}
) {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const configuredSameSite = String(
    config.get<string>('AUTH_COOKIE_SAME_SITE') || (isProduction ? 'none' : 'lax')
  ).toLowerCase();
  const sameSite: SameSiteMode = ['lax', 'strict', 'none'].includes(configuredSameSite)
    ? (configuredSameSite as SameSiteMode)
    : isProduction
      ? 'none'
      : 'lax';
  const secureSetting = config.get<string>('AUTH_COOKIE_SECURE');
  const secure =
    sameSite === 'none' || (secureSetting ? secureSetting.toLowerCase() === 'true' : isProduction);
  const domain = config.get<string>('AUTH_COOKIE_DOMAIN') || undefined;

  return {
    httpOnly: options.httpOnly ?? true,
    secure,
    sameSite,
    path: options.path || '/api/v1',
    ...(domain ? { domain } : {}),
    ...(options.maxAge ? { maxAge: options.maxAge } : {}),
  };
}
