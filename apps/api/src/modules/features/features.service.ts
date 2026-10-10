import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Feature } from './entities/feature.entity';
import { TenantFeature } from './entities/tenant-feature.entity';

/**
 * كاش في الذاكرة لمجموعة الميزات الفعّالة لكل تاجر (استعلام واحد بدل استعلامات
 * متعددة لكل طلب). يُمسح فوراً عند أي تعديل من المدير العام. في حالة تشغيل أكثر
 * من نسخة من الخادم، أقصى تأخير لانعكاس التعديل هو مدة الـ TTL.
 */
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { codes: Set<string>; expiresAt: number }>();

export interface FeatureChange {
  code: string;
  isEnabled: boolean;
}

@Injectable()
export class FeaturesService {
  constructor(
    @InjectRepository(Feature)
    private readonly featuresRepository: Repository<Feature>,
    @InjectRepository(TenantFeature)
    private readonly tenantFeaturesRepository: Repository<TenantFeature>
  ) {}

  /**
   * يحسب الميزات الفعّالة للتاجر:
   * - الأساسية (isCore) دائماً مفعّلة.
   * - غيرها لازم تكون مفعّلة في tenant_features وغير منتهية.
   * - أي ميزة اعتمادياتها غير مفعّلة تعتبر غير مفعّلة (تكرار حتى الثبات).
   */
  async getEnabledCodes(tenantId: string): Promise<Set<string>> {
    const cached = cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.codes;

    const [features, assigned] = await Promise.all([
      this.featuresRepository.find({ where: { isActive: true } }),
      this.tenantFeaturesRepository.find({ where: { tenantId } }),
    ]);
    const now = new Date();
    const enabledIds = new Set(
      assigned
        .filter((t) => t.isEnabled && (!t.expiresAt || t.expiresAt > now))
        .map((t) => t.featureId)
    );
    const byId = new Map(features.map((f) => [f.id, f]));
    const enabled = new Set<string>(
      features.filter((f) => f.isCore || enabledIds.has(f.id)).map((f) => f.id)
    );

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of Array.from(enabled)) {
        const f = byId.get(id)!;
        if (f.isCore) continue;
        if ((f.dependsOn || []).some((dep) => byId.has(dep) && !enabled.has(dep))) {
          enabled.delete(id);
          changed = true;
        }
      }
    }

    const codes = new Set(Array.from(enabled).map((id) => byId.get(id)!.code));
    cache.set(tenantId, { codes, expiresAt: Date.now() + CACHE_TTL_MS });
    return codes;
  }

  async tenantHasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    return (await this.getEnabledCodes(tenantId)).has(featureCode);
  }

  async getTenantFeatures(tenantId: string): Promise<Feature[]> {
    const codes = await this.getEnabledCodes(tenantId);
    if (!codes.size) return [];
    return this.featuresRepository.find({
      where: { code: In(Array.from(codes)), isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /** تفعيل/إيقاف ميزة واحدة بدون تتبع الاعتماديات (يستخدم داخلياً). */
  async setFeatureStatus(
    tenantId: string,
    featureId: string,
    isEnabled: boolean,
    extra?: {
      config?: Record<string, any>;
      limits?: Record<string, any>;
      expiresAt?: Date | null;
      actorId?: string;
    }
  ): Promise<TenantFeature> {
    let tenantFeature = await this.tenantFeaturesRepository.findOne({
      where: { tenantId, featureId },
      withDeleted: true,
    });

    if (!tenantFeature) {
      tenantFeature = this.tenantFeaturesRepository.create({ tenantId, featureId });
    }

    tenantFeature.deletedAt = null as any; // استعادة لو كان محذوف (soft delete)
    tenantFeature.isEnabled = isEnabled;
    if (extra?.config) tenantFeature.config = extra.config;
    if (extra?.limits) tenantFeature.limits = extra.limits;
    if (extra?.expiresAt !== undefined) tenantFeature.expiresAt = extra.expiresAt ?? undefined;
    if (isEnabled) {
      tenantFeature.enabledAt = new Date();
      tenantFeature.enabledBy = extra?.actorId;
      tenantFeature.disabledAt = undefined;
    } else {
      tenantFeature.disabledAt = new Date();
      tenantFeature.disabledBy = extra?.actorId;
    }

    const saved = await this.tenantFeaturesRepository.save(tenantFeature);
    this.invalidateCache(tenantId);
    return saved;
  }

  /**
   * تفعيل/إيقاف ميزة مع مراعاة الاعتماديات:
   * - التفعيل يفعّل كل الاعتماديات تلقائياً (مثلاً نقطة البيع => المبيعات => المنتجات).
   * - الإيقاف يوقف كل الميزات المعتمدة عليها (مثلاً إيقاف المخزون => المخازن المتعددة).
   * يرجع قائمة بكل التغييرات الفعلية اللي حصلت.
   */
  async toggleWithDependencies(
    tenantId: string,
    featureId: string,
    isEnabled: boolean,
    options?: { expiresAt?: Date | null; actorId?: string }
  ): Promise<FeatureChange[]> {
    const features = await this.featuresRepository.find({ where: { isActive: true } });
    const byId = new Map(features.map((f) => [f.id, f]));
    const target = byId.get(featureId);
    if (!target) throw new NotFoundException('الميزة غير موجودة');
    if (target.isCore) {
      throw new BadRequestException(
        `"${target.nameAr}" ميزة أساسية مفعّلة دائماً ولا يمكن تعديلها`
      );
    }

    const toChange = new Set<string>([featureId]);
    if (isEnabled) {
      const stack = [...(target.dependsOn || [])];
      while (stack.length) {
        const id = stack.pop()!;
        const f = byId.get(id);
        if (!f || f.isCore || toChange.has(id)) continue;
        toChange.add(id);
        stack.push(...(f.dependsOn || []));
      }
    } else {
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of features) {
          if (toChange.has(f.id) || f.isCore) continue;
          if ((f.dependsOn || []).some((d) => toChange.has(d))) {
            toChange.add(f.id);
            grew = true;
          }
        }
      }
    }

    const current = await this.tenantFeaturesRepository.find({ where: { tenantId } });
    const currentMap = new Map(current.map((t) => [t.featureId, t.isEnabled]));
    const changes: FeatureChange[] = [];
    for (const id of toChange) {
      const isTarget = id === featureId;
      if (!isTarget && (currentMap.get(id) ?? false) === isEnabled) continue;
      await this.setFeatureStatus(tenantId, id, isEnabled, {
        expiresAt: isTarget ? options?.expiresAt : undefined,
        actorId: options?.actorId,
      });
      changes.push({ code: byId.get(id)!.code, isEnabled });
    }
    return changes;
  }

  invalidateCache(tenantId?: string): void {
    if (tenantId) cache.delete(tenantId);
    else cache.clear();
  }

  async findAll(): Promise<Feature[]> {
    return this.featuresRepository.find({ order: { sortOrder: 'ASC' } });
  }

  /** كل الميزات + حالتها للتاجر (للوحة المدير العام). */
  async getAllWithStatus(tenantId: string) {
    const [features, assigned, effective] = await Promise.all([
      this.featuresRepository.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', code: 'ASC' },
      }),
      this.tenantFeaturesRepository.find({ where: { tenantId } }),
      this.getEnabledCodes(tenantId),
    ]);
    const map = new Map(assigned.map((t) => [t.featureId, t]));
    const codeById = new Map(features.map((f) => [f.id, f.code]));
    return features.map((f) => {
      const tf = map.get(f.id);
      return {
        id: f.id,
        code: f.code,
        name: f.name,
        nameAr: f.nameAr,
        descriptionAr: f.descriptionAr,
        category: f.category,
        isCore: f.isCore,
        requiresPlan: f.requiresPlan,
        dependsOn: (f.dependsOn || []).map((d) => codeById.get(d)).filter(Boolean),
        isEnabled: f.isCore || !!tf?.isEnabled,
        isEffective: effective.has(f.code),
        expiresAt: tf?.expiresAt ?? null,
        enabledAt: tf?.isEnabled ? tf.enabledAt : null,
      };
    });
  }
}
