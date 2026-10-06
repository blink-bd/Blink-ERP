import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { MasterAdmin } from './entities/master-admin.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Plan } from '@/modules/features/entities/plan.entity';
import { Feature } from '@/modules/features/entities/feature.entity';
import { UsersService } from '@/modules/users/users.service';
import { assertStrongPassword } from '@/common/utils/password-policy';
import { TenantStatusDto, TenantSubscriptionDto } from './dto/master-admin.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 30;
const TOKEN_TTL = '8h';

@Injectable()
export class MasterAdminService implements OnModuleInit {
  constructor(
    @InjectRepository(MasterAdmin) private readonly admins: Repository<MasterAdmin>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(Feature) private readonly features: Repository<Feature>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService
  ) {}

  onModuleInit() {
    const secret = this.config.get<string>('JWT_MASTER_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_MASTER_SECRET مطلوب ولازم يكون 32 حرف على الأقل (منفصل عن JWT_ACCESS_SECRET)'
      );
    }
    if (secret === this.config.get('JWT_ACCESS_SECRET')) {
      throw new Error('JWT_MASTER_SECRET لازم يختلف عن JWT_ACCESS_SECRET');
    }
  }

  private get secret(): string {
    return this.config.get<string>('JWT_MASTER_SECRET') as string;
  }

  // ---------- Authentication ----------
  async login(email: string, password: string, ip: string) {
    const admin = await this.admins.findOne({ where: { email: email.toLowerCase().trim() } });
    const invalid = new UnauthorizedException('بيانات الدخول غير صحيحة');

    if (!admin || !admin.isActive) throw invalid;

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول لاحقاً');
    }

    const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!ok) {
      admin.failedLoginAttempts += 1;
      if (admin.failedLoginAttempts >= MAX_FAILED) {
        admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        admin.failedLoginAttempts = 0;
      }
      await this.admins.save(admin);
      await this.audit(
        admin.email,
        'MASTER_LOGIN_FAILED',
        'master_admin',
        admin.id,
        {},
        ip,
        'warning'
      );
      throw invalid;
    }

    await this.admins.update(admin.id, {
      failedLoginAttempts: 0,
      lockedUntil: (() => 'NULL') as any,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
    await this.audit(admin.email, 'MASTER_LOGIN', 'master_admin', admin.id, {}, ip);

    const accessToken = this.jwt.sign(
      { sub: admin.id, email: admin.email, role: 'master_admin', type: 'master' },
      { secret: this.secret, expiresIn: TOKEN_TTL }
    );
    return { accessToken, admin: { id: admin.id, email: admin.email, fullName: admin.fullName } };
  }

  /** يستخدمه الـ Guard: يتحقق من التوكن ويرجع الأدمن أو يرفض. */
  async authenticate(token: string): Promise<MasterAdmin> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    if (payload?.role !== 'master_admin' || payload?.type !== 'master') {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    const admin = await this.admins.findOne({ where: { id: payload.sub } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('الحساب غير مفعّل');
    return admin;
  }

  async changePassword(adminId: string, current: string, next: string) {
    const admin = await this.admins.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException();
    if (!(await argon2.verify(admin.passwordHash, current).catch(() => false))) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }
    assertStrongPassword(next);
    admin.passwordHash = await argon2.hash(next, { type: argon2.argon2id });
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_PASSWORD_CHANGED',
      'master_admin',
      admin.id,
      {},
      undefined
    );
  }

  // ---------- Dashboard ----------
  async dashboard() {
    const [t] = await this.dataSource.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active AND subscription_status = 'active'
          AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))::int AS active,
        COUNT(*) FILTER (WHERE NOT is_active OR subscription_status IN ('suspended','cancelled'))::int AS suspended,
        COUNT(*) FILTER (WHERE subscription_status = 'expired'
          OR (subscription_end_date IS NOT NULL AND subscription_end_date <= NOW()))::int AS expired,
        COUNT(*) FILTER (WHERE subscription_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days')::int AS "expiringSoon",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS "new30d"
      FROM tenants WHERE deleted_at IS NULL`);
    const [u] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM users WHERE deleted_at IS NULL`
    );
    const [s] = await this.dataSource.query(`
      SELECT COUNT(*)::int AS "salesCount", COALESCE(SUM(total),0) AS "salesTotal"
      FROM sales WHERE status = 'completed' AND sale_date > NOW() - INTERVAL '30 days'`);
    return { tenants: t, usersTotal: u.total, last30Days: s };
  }

  listPlans() {
    return this.plans.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  listFeatureCatalog() {
    return this.features.find({ order: { category: 'ASC', code: 'ASC' } });
  }

  // ---------- Tenant management ----------
  private async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('التاجر غير موجود');
    return tenant;
  }

  async setTenantStatus(id: string, dto: TenantStatusDto, adminEmail: string, ip: string) {
    const tenant = await this.getTenant(id);
    const before = { isActive: tenant.isActive, subscriptionStatus: tenant.subscriptionStatus };
    if (dto.isActive !== undefined) tenant.isActive = dto.isActive;
    if (dto.subscriptionStatus)
      tenant.subscriptionStatus = dto.subscriptionStatus as Tenant['subscriptionStatus'];
    const saved = await this.tenants.save(tenant);
    await this.audit(
      adminEmail,
      'TENANT_STATUS_CHANGED',
      'tenant',
      id,
      { before, after: dto },
      ip,
      'warning'
    );
    return saved;
  }

  async setTenantSubscription(
    id: string,
    dto: TenantSubscriptionDto,
    adminEmail: string,
    ip: string
  ) {
    const tenant = await this.getTenant(id);
    if (dto.planId) tenant.planId = dto.planId;
    if (dto.subscriptionStartDate)
      tenant.subscriptionStartDate = new Date(dto.subscriptionStartDate);
    if (dto.subscriptionEndDate) tenant.subscriptionEndDate = new Date(dto.subscriptionEndDate);
    if (dto.subscriptionAmount !== undefined) tenant.subscriptionAmount = dto.subscriptionAmount;
    if (dto.subscriptionCycle)
      tenant.subscriptionCycle = dto.subscriptionCycle as Tenant['subscriptionCycle'];
    if (dto.subscriptionNote !== undefined) tenant.subscriptionNote = dto.subscriptionNote;
    // تجديد الاشتراك بتاريخ مستقبلي يعيد التفعيل تلقائياً
    if (
      tenant.subscriptionEndDate &&
      tenant.subscriptionEndDate > new Date() &&
      tenant.subscriptionStatus === 'expired'
    ) {
      tenant.subscriptionStatus = 'active';
    }
    const saved = await this.tenants.save(tenant);
    await this.audit(adminEmail, 'TENANT_SUBSCRIPTION_UPDATED', 'tenant', id, dto, ip);
    return saved;
  }

  async listTenantUsers(tenantId: string) {
    await this.getTenant(tenantId);
    const rows = await this.users.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      lockedUntil: u.lockedUntil,
    }));
  }

  async resetTenantUserPassword(
    tenantId: string,
    userId: string,
    newPassword: string,
    adminEmail: string,
    ip: string
  ) {
    const user = await this.users.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود في هذا التاجر');
    assertStrongPassword(newPassword);
    await this.usersService.setPassword(userId, newPassword);
    await this.audit(
      adminEmail,
      'TENANT_USER_PASSWORD_RESET',
      'user',
      userId,
      { tenantId },
      ip,
      'warning'
    );
  }

  // ---------- Audit ----------
  async audit(
    adminEmail: string,
    action: string,
    entityType: string,
    entityId: string | undefined,
    values: any,
    ip?: string,
    severity: 'info' | 'warning' | 'error' = 'info'
  ) {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs (user_email, user_ip, action, entity_type, entity_id, new_values, description, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          adminEmail,
          ip || null,
          action,
          entityType,
          entityId || null,
          JSON.stringify(values || {}),
          'master_admin',
          severity,
        ]
      );
    } catch {
      // التدقيق لا يجب أن يكسر العملية الأساسية
    }
  }

  async auditLogs(limit = 50) {
    return this.dataSource.query(
      `SELECT id, user_email AS "adminEmail", user_ip AS "ip", action, entity_type AS "entityType",
              entity_id AS "entityId", new_values AS "details", severity, created_at AS "createdAt"
       FROM audit_logs WHERE description = 'master_admin'
       ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
  }
}
