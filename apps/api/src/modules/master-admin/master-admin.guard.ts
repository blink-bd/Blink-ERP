import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { MasterAdminService } from './master-admin.service';

@Injectable()
export class MasterAdminGuard implements CanActivate {
  constructor(private readonly masterAdminService: MasterAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('مطلوب تسجيل دخول المدير العام');
    }
    const admin = await this.masterAdminService.authenticate(header.substring(7));
    request.masterAdmin = { id: admin.id, email: admin.email, fullName: admin.fullName };
    return true;
  }
}
