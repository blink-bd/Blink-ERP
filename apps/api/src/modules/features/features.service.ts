import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feature } from './entities/feature.entity';
import { TenantFeature } from './entities/tenant-feature.entity';

/**
 * In-memory cache with a short TTL. Swap for Redis-backed cache in production
 * (see docs/FEATURE_SYSTEM.md "Caching Strategy").
 */
const cache = new Map<string, { value: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

@Injectable()
export class FeaturesService {
  constructor(
    @InjectRepository(Feature)
    private readonly featuresRepository: Repository<Feature>,
    @InjectRepository(TenantFeature)
    private readonly tenantFeaturesRepository: Repository<TenantFeature>
  ) {}

  private getCache(key: string): boolean | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCache(key: string, value: boolean): void {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  async tenantHasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    const cacheKey = `tenant:${tenantId}:feature:${featureCode}`;
    const cached = this.getCache(cacheKey);
    if (cached !== undefined) return cached;

    const feature = await this.featuresRepository.findOne({ where: { code: featureCode } });
    if (!feature || !feature.isActive) {
      this.setCache(cacheKey, false);
      return false;
    }
    if (feature.isCore) {
      this.setCache(cacheKey, true);
      return true;
    }

    const tenantFeature = await this.tenantFeaturesRepository.findOne({
      where: { tenantId, featureId: feature.id },
    });

    if (!tenantFeature || !tenantFeature.isEnabled) {
      this.setCache(cacheKey, false);
      return false;
    }

    if (tenantFeature.expiresAt && tenantFeature.expiresAt < new Date()) {
      this.setCache(cacheKey, false);
      return false;
    }

    if (feature.dependsOn?.length) {
      for (const depId of feature.dependsOn) {
        const dep = await this.featuresRepository.findOne({ where: { id: depId } });
        if (dep && !(await this.tenantHasFeature(tenantId, dep.code))) {
          this.setCache(cacheKey, false);
          return false;
        }
      }
    }

    this.setCache(cacheKey, true);
    return true;
  }

  async getTenantFeatures(tenantId: string): Promise<Feature[]> {
    const allFeatures = await this.featuresRepository.find({ where: { isActive: true } });
    const enabled: Feature[] = [];
    for (const feature of allFeatures) {
      if (await this.tenantHasFeature(tenantId, feature.code)) {
        enabled.push(feature);
      }
    }
    return enabled;
  }

  async setFeatureStatus(
    tenantId: string,
    featureId: string,
    isEnabled: boolean,
    extra?: { config?: Record<string, any>; limits?: Record<string, any>; expiresAt?: Date }
  ): Promise<TenantFeature> {
    let tenantFeature = await this.tenantFeaturesRepository.findOne({
      where: { tenantId, featureId },
    });

    if (!tenantFeature) {
      tenantFeature = this.tenantFeaturesRepository.create({ tenantId, featureId });
    }

    tenantFeature.isEnabled = isEnabled;
    if (extra?.config) tenantFeature.config = extra.config;
    if (extra?.limits) tenantFeature.limits = extra.limits;
    if (extra?.expiresAt) tenantFeature.expiresAt = extra.expiresAt;
    tenantFeature.enabledAt = isEnabled ? new Date() : tenantFeature.enabledAt;
    tenantFeature.disabledAt = !isEnabled ? new Date() : undefined;

    const saved = await this.tenantFeaturesRepository.save(tenantFeature);
    this.invalidateCache(tenantId);
    return saved;
  }

  invalidateCache(tenantId: string): void {
    for (const key of cache.keys()) {
      if (key.startsWith(`tenant:${tenantId}:`)) {
        cache.delete(key);
      }
    }
  }

  async findAll(): Promise<Feature[]> {
    return this.featuresRepository.find({ order: { sortOrder: 'ASC' } });
  }

  /** كل الميزات + هل هي مفعّلة للتاجر (للوحة المدير العام). */
  async getAllWithStatus(tenantId: string) {
    const [features, assigned] = await Promise.all([
      this.featuresRepository.find({
        where: { isActive: true },
        order: { category: 'ASC', code: 'ASC' },
      }),
      this.tenantFeaturesRepository.find({ where: { tenantId } }),
    ]);
    const map = new Map(assigned.map((t) => [t.featureId, t]));
    return features.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      nameAr: f.nameAr,
      category: f.category,
      isCore: f.isCore,
      requiresPlan: f.requiresPlan,
      isEnabled: f.isCore || !!map.get(f.id)?.isEnabled,
    }));
  }
}
