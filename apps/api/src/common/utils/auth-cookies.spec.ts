import { ConfigService } from '@nestjs/config';
import { authCookieOptions, durationToMilliseconds } from './auth-cookies';

describe('auth cookie helpers', () => {
  const configFor = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('uses secure cross-site cookies by default in production', () => {
    const options = authCookieOptions(configFor({ NODE_ENV: 'production' }));
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/v1',
    });
  });

  it('uses lax non-secure cookies locally and accepts a configured domain', () => {
    const options = authCookieOptions(
      configFor({ NODE_ENV: 'development', AUTH_COOKIE_DOMAIN: '.example.test' }),
      { path: '/api/v1/auth', httpOnly: false }
    );
    expect(options).toMatchObject({
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      path: '/api/v1/auth',
      domain: '.example.test',
    });
  });

  it('converts JWT expiry strings to cookie max-age milliseconds', () => {
    expect(durationToMilliseconds('15m', 0)).toBe(900_000);
    expect(durationToMilliseconds('7d', 0)).toBe(604_800_000);
    expect(durationToMilliseconds('invalid', 123)).toBe(123);
  });
});
