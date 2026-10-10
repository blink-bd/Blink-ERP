import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/api-key.dto';
import {
  API_KEY_GRANTABLE_PERMISSIONS,
  API_KEY_PREFIX,
  MAX_API_KEYS_PER_TENANT,
} from './api-keys.constants';
import { randomToken, sha256Hex } from '@/common/security/crypto.util';
import { UsersService } from '@/modules/users/users.service';
import { FeaturesService } from '@/modules/features/features.service';
import { assertTenantUsable } from '@/common/utils/tenant-access';
import { AuditService } from '@/modules/audit/audit.service';

export const API_ACCESS_FEATURE = 'api_access';

export interface ApiKeyPrincipal {
  id: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  authType: 'api_key';
  apiKeyId: string;
  apiKeyName: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>,
    private readonly usersService: UsersService,
    private readonly featuresService: FeaturesService,
    private readonly audit: AuditService
  ) {}

  static looksLikeApiKey(value?: string | null): boolean {
    return !!value && value.startsWith(API_KEY_PREFIX);
  }

  // ---------------- Management (tenant owner/admin) ----------------
  async list(tenantId: string) {
    const keys = await this.repo.find({
      where: { tenantId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => this.toPublic(k));
  }

  private toPublic(k: ApiKey) {
    const now = new Date();
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      permissions: k.permissions,
      createdBy: k.createdBy,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      status: k.revokedAt ? 'revoked' : k.expiresAt && k.expiresAt <= now ? 'expired' : 'active',
    };
  }

  async create(
    tenantId: string,
    dto: CreateApiKeyDto,
    actor: { id: string; permissions: string[] },
    req: any
  ) {
    const active = await this.repo.count({
      where: { tenantId, revokedAt: IsNull(), deletedAt: IsNull() },
    });
    if (active >= MAX_API_KEYS_PER_TENANT) {
      throw new BadRequestException(`الحد الأقصى ${MAX_API_KEYS_PER_TENANT} مفتاح فعّال`);
    }

    const requested = Array.from(new Set(dto.permissions));
    const grantable = new Set<string>(API_KEY_GRANTABLE_PERMISSIONS);
    const actorPerms = new Set(actor.permissions || []);
    const invalid = requested.filter((p) => !grantable.has(p));
    if (invalid.length)
      throw new BadRequestException(`صلاحيات غير مسموحة للمفاتيح: ${invalid.join(', ')}`);
    // منع تصعيد الصلاحيات: ماينفعش تدي المفتاح صلاحية إنت نفسك مش عندك
    const exceeding = requested.filter((p) => !actorPerms.has(p));
    if (exceeding.length) {
      throw new ForbiddenException(`لا يمكنك منح صلاحيات لا تملكها: ${exceeding.join(', ')}`);
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt <= new Date())
        throw new BadRequestException('تاريخ الانتهاء لازم يكون في المستقبل');
    }

    const secret = `${API_KEY_PREFIX}${randomToken(32)}`;
    const entity = this.repo.create({
      tenantId,
      name: dto.name.trim(),
      keyPrefix: secret.slice(0, API_KEY_PREFIX.length + 6),
      keyHash: sha256Hex(secret),
      permissions: requested,
      createdBy: actor.id,
      expiresAt,
    });
    const saved = await this.repo.save(entity);
    await this.audit.log({
      ...this.actor(req),
      action: 'API_KEY_CREATED',
      entityType: 'api_key',
      entityId: saved.id,
      newValues: { name: saved.name, permissions: requested, expiresAt },
      severity: 'warning',
    });
    // المفتاح الكامل يظهر مرة واحدة فقط ولا يمكن استرجاعه بعد كده
    return { ...this.toPublic(saved), key: secret };
  }

  async revoke(tenantId: string, id: string, actorId: string, req: any) {
    const key = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!key) throw new NotFoundException('المفتاح غير موجود');
    if (!key.revokedAt) {
      key.revokedAt = new Date();
      key.revokedBy = actorId;
      await this.repo.save(key);
      await this.audit.log({
        ...this.actor(req),
        action: 'API_KEY_REVOKED',
        entityType: 'api_key',
        entityId: key.id,
        newValues: { name: key.name },
        severity: 'warning',
      });
    }
    return this.toPublic(key);
  }

  private actor(req: any) {
    return {
      tenantId: req?.tenantId,
      userId: req?.user?.id,
      userEmail: req?.user?.email,
      ip: req?.ip,
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 500),
    };
  }

  // ---------------- Authentication ----------------
  /**
   * يتحقق من مفتاح API ويرجع "هوية" محدودة الصلاحيات:
   * - المفتاح غير ملغي وغير منتهي.
   * - التاجر مفعّل واشتراكه ساري وميزة api_access مفعّلة له.
   * - منشئ المفتاح ما زال مستخدماً فعّالاً، والصلاحيات = تقاطع صلاحيات المفتاح مع
   *   صلاحياته الحالية (لو اتسحبت منه صلاحية تتسحب من المفتاح فوراً).
   */
  async authenticate(rawKey: string, ip?: string): Promise<ApiKeyPrincipal> {
    const invalid = new UnauthorizedException('مفتاح API غير صالح');
    if (!ApiKeysService.looksLikeApiKey(rawKey) || rawKey.length > 200) throw invalid;

    const key = await this.repo
      .createQueryBuilder('k')
      .where('k.key_hash = :hash', { hash: sha256Hex(rawKey) })
      .andWhere('k.deleted_at IS NULL')
      .getOne();
    if (!key || key.revokedAt) throw invalid;
    if (key.expiresAt && key.expiresAt <= new Date()) {
      throw new UnauthorizedException('مفتاح API منتهي الصلاحية');
    }

    if (!key.createdBy) throw invalid;
    const owner = await this.usersService.findById(key.createdBy);
    if (!owner || !owner.isActive || owner.tenantId !== key.tenantId) throw invalid;
    assertTenantUsable(owner.tenant);

    if (!(await this.featuresService.tenantHasFeature(key.tenantId, API_ACCESS_FEATURE))) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        feature: API_ACCESS_FEATURE,
        message: 'ميزة الوصول عبر API غير مفعّلة لهذا الحساب',
      });
    }

    const ownerPerms = new Set(
      (owner.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.name))
    );
    const grantable = new Set<string>(API_KEY_GRANTABLE_PERMISSIONS);
    const permissions = (key.permissions || []).filter(
      (p) => grantable.has(p) && ownerPerms.has(p)
    );

    // تحديث "آخر استخدام" بحد أقصى مرة كل دقيقة لتقليل الكتابة على القاعدة
    if (
      !key.lastUsedAt ||
      Date.now() - key.lastUsedAt.getTime() > 60_000 ||
      key.lastUsedIp !== ip
    ) {
      await this.repo.update(key.id, { lastUsedAt: new Date(), lastUsedIp: ip || null });
    }

    return {
      id: owner.id,
      tenantId: key.tenantId,
      email: `api-key:${key.name}`,
      roles: [],
      permissions,
      authType: 'api_key',
      apiKeyId: key.id,
      apiKeyName: key.name,
    };
  }
}
