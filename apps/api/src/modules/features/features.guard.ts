import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeaturesService } from './features.service';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featuresService: FeaturesService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature =
      this.reflector.get<string>('requiredFeature', context.getHandler()) ||
      this.reflector.get<string>('requiredFeature', context.getClass());

    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId;

    const hasFeature = await this.featuresService.tenantHasFeature(tenantId, requiredFeature);
    if (!hasFeature) {
      throw new ForbiddenException(`Feature '${requiredFeature}' is not enabled for this tenant`);
    }
    return true;
  }
}
