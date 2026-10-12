import { CsrfMiddleware } from './csrf.middleware';
import { CSRF_TOKEN_COOKIE } from '@/common/utils/auth-cookies';

describe('CsrfMiddleware', () => {
  const middleware = new CsrfMiddleware();
  const run = (method: string, path: string, cookieToken?: string, headerToken?: string) => {
    const request: any = {
      method,
      path,
      cookies: cookieToken ? { [CSRF_TOKEN_COOKIE]: cookieToken } : {},
      header: () => headerToken,
    };
    const response: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    middleware.use(request, response, next);
    return { response, next };
  };

  it('accepts state-changing requests only when cookie and header match', () => {
    const { next, response } = run('POST', '/api/v1/sales', 'secure-random', 'secure-random');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('rejects missing or mismatched CSRF tokens', () => {
    const { next, response } = run('DELETE', '/api/v1/products/1', 'cookie-token', 'other-token');
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CSRF_VALIDATION_FAILED' }),
      })
    );
  });

  it('allows safe reads and the separately token-protected backup alert endpoint', () => {
    const safeRead = run('GET', '/api/v1/sales');
    const backupAlert = run('POST', '/api/v1/ops/backup-alert');
    expect(safeRead.next).toHaveBeenCalledTimes(1);
    expect(backupAlert.next).toHaveBeenCalledTimes(1);
    expect(backupAlert.response.status).not.toHaveBeenCalled();
  });
});
