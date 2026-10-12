import { Injectable, NestMiddleware } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { CSRF_TOKEN_COOKIE } from '@/common/utils/auth-cookies';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_JOB_PATHS = new Set([
  '/api/v1/ops/backup-alert',
  '/api/v1/ops/balance-reminders/run',
]);

function constantTimeMatch(cookieToken: unknown, headerToken: unknown): boolean {
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  const cookie = Buffer.from(cookieToken);
  const header = Buffer.from(headerToken);
  return cookie.length === header.length && cookie.length > 0 && timingSafeEqual(cookie, header);
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!UNSAFE_METHODS.has(req.method) || CSRF_EXEMPT_JOB_PATHS.has(req.path)) {
      next();
      return;
    }

    const cookieToken = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[
      CSRF_TOKEN_COOKIE
    ];
    const headerToken = req.header('x-csrf-token');
    if (!constantTimeMatch(cookieToken, headerToken)) {
      res.status(403).json({
        success: false,
        error: {
          message: 'طلب غير موثوق؛ حدّث الجلسة وحاول مرة أخرى',
          code: 'CSRF_VALIDATION_FAILED',
        },
      });
      return;
    }

    next();
  }
}
