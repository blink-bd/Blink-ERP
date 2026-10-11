import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeaturesService } from './features.service';
import { REQUIRED_FEATURES_KEY } from '@/common/decorators/require-feature.decorator';
import { getFeatureDefinition } from './features.catalog';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featuresService: FeaturesService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // نجمع ميزات الكلاس + الـ handler (AND) بدل ما الـ handler يلغي شرط الكلاس
    const required = Array.from(
      new Set(
        (
          this.reflector.getAll<(string[] | undefined)[]>(REQUIRED_FEATURES_KEY, [
            context.getClass(),
            context.getHandler(),
          ]) || []
        )
          .flat()
          .filter(Boolean) as string[]
      )
    );

    if (!required.length) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId || request.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context required');

    for (const code of required) {
      if (!(await this.featuresService.tenantHasFeature(tenantId, code))) {
        const name = getFeatureDefinition(code)?.nameAr || code;
        throw new ForbiddenException({
          code: 'FEATURE_DISABLED',
          feature: code,
          message: `ميزة "${name}" غير مفعّلة لحسابك. تواصل مع الإدارة لتفعيلها`,
        });
      }
    }
    return true;
  }
}
