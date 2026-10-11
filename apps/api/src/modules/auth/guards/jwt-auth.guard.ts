import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import { NO_API_KEY } from '@/common/decorators/no-api-key.decorator';

/**
 * المصادقة: إما JWT لمستخدم مسجّل دخول، أو مفتاح API (X-API-Key أو Bearer blk_live_...)
 * لو ميزة api_access مفعّلة للتاجر. المفاتيح ممنوعة على أي endpoint عليه @NoApiKey().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headerKey = request.headers['x-api-key'];
    const auth: string | undefined = request.headers.authorization;
    const bearer = auth?.startsWith('Bearer ') ? auth.substring(7).trim() : undefined;
    const rawKey =
      (typeof headerKey === 'string' && headerKey.trim()) ||
      (ApiKeysService.looksLikeApiKey(bearer) ? bearer : undefined);

    if (rawKey) {
      const blocked = this.reflector.getAllAndOverride<boolean>(NO_API_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (blocked) {
        throw new ForbiddenException('هذه العملية تتطلب تسجيل دخول مستخدم ولا تقبل مفاتيح API');
      }
      request.user = await this.apiKeys.authenticate(rawKey, request.ip);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid token');
    }
    return user;
  }
}
