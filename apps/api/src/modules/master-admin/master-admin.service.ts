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
import { burnPasswordVerification } from '@/common/security/timing';
import { TenantLimitsDto, TenantStatusDto, TenantSubscriptionDto } from './dto/master-admin.dto';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  isIpAllowed,
  parseIpAllowlist,
  totpUri,
  verifyTotp,
} from '@/common/security/crypto.util';

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
  private get allowlist(): string[] {
    return parseIpAllowlist(this.config.get<string>('MASTER_ADMIN_ALLOWED_IPS'));
  }

  /** لو MASTER_ADMIN_ALLOWED_IPS مضبوط، لوحة المدير العام متاحة من الـ IPs دي بس. */
  assertIpAllowed(ip: string) {
    if (!isIpAllowed(ip, this.allowlist)) {
      throw new ForbiddenException('غير مسموح بالوصول للوحة المدير العام من هذا العنوان');
    }
  }

  private get totpKey(): string {
    return (this.config.get<string>('MASTER_2FA_ENCRYPTION_KEY') || this.secret) as string;
  }

  private signToken(admin: MasterAdmin) {
    return this.jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: 'master_admin',
        type: 'master',
        sv: admin.sessionVersion ?? 0,
      },
      { secret: this.secret, expiresIn: TOKEN_TTL }
    );
  }

  private async registerFailure(admin: MasterAdmin, ip: string, reason: string) {
    admin.failedLoginAttempts += 1;
    let locked = false;
    if (admin.failedLoginAttempts >= MAX_FAILED) {
      admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      admin.failedLoginAttempts = 0;
      locked = true;
    }
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      locked ? 'MASTER_ACCOUNT_LOCKED' : 'MASTER_LOGIN_FAILED',
      'master_admin',
      admin.id,
      { reason },
      ip,
      'warning'
    );
  }

  async login(email: string, password: string, ip: string, otp?: string) {
    this.assertIpAllowed(ip);
    const admin = await this.admins.findOne({ where: { email: email.toLowerCase().trim() } });
    const invalid = new UnauthorizedException('بيانات الدخول غير صحيحة');

    if (!admin || !admin.isActive) {
      // نفس زمن الاستجابة تقريباً لمنع اكتشاف الإيميلات الموجودة
      await burnPasswordVerification(password);
      throw invalid;
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول لاحقاً');
    }

    const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.registerFailure(admin, ip, 'password');
      throw invalid;
    }

    if (admin.totpEnabled && admin.totpSecret) {
      if (!otp) {
        throw new UnauthorizedException({
          code: 'OTP_REQUIRED',
          message: 'أدخل رمز المصادقة الثنائية من تطبيق Authenticator',
        });
      }
      const secret = decryptSecret(admin.totpSecret, this.totpKey);
      const step = verifyTotp(secret, otp, {
        lastUsedStep: admin.totpLastStep != null ? Number(admin.totpLastStep) : null,
      });
      if (step === null) {
        await this.registerFailure(admin, ip, 'otp');
        throw new UnauthorizedException({ code: 'OTP_INVALID', message: 'رمز المصادقة غير صحيح' });
      }
      admin.totpLastStep = String(step);
    }

    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null as any;
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = ip;
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_LOGIN',
      'master_admin',
      admin.id,
      { twoFactor: admin.totpEnabled },
      ip
    );

    return {
      accessToken: this.signToken(admin),
      admin: this.publicAdmin(admin),
    };
  }

  publicAdmin(admin: MasterAdmin) {
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      twoFactorEnabled: !!admin.totpEnabled,
      lastLoginAt: admin.lastLoginAt,
      lastLoginIp: admin.lastLoginIp,
    };
  }

  /** يستخدمه الـ Guard: يتحقق من التوكن ويرجع الأدمن أو يرفض. */
  async authenticate(token: string, ip?: string): Promise<MasterAdmin> {
    if (ip !== undefined) this.assertIpAllowed(ip);
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
    if ((payload.sv ?? 0) !== (admin.sessionVersion ?? 0)) {
      throw new UnauthorizedException('انتهت الجلسة، سجّل الدخول مرة أخرى');
    }
    return admin;
  }

  private async getAdmin(adminId: string): Promise<MasterAdmin> {
    const admin = await this.admins.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException();
    return admin;
  }

  private async assertPassword(admin: MasterAdmin, password: string) {
    if (!(await argon2.verify(admin.passwordHash, password || '').catch(() => false))) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }
  }

  async changePassword(adminId: string, current: string, next: string, ip?: string) {
    const admin = await this.getAdmin(adminId);
    await this.assertPassword(admin, current);
    assertStrongPassword(next);
    if (next.length < 12)
      throw new ForbiddenException('كلمة مرور المدير العام لازم 12 حرف على الأقل');
    admin.passwordHash = await argon2.hash(next, { type: argon2.argon2id });
    admin.passwordChangedAt = new Date();
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1; // كل الأجهزة التانية تخرج
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_PASSWORD_CHANGED',
      'master_admin',
      admin.id,
      {},
      ip,
      'warning'
    );
    return { accessToken: this.signToken(admin) };
  }

  /** تسجيل الخروج من كل الأجهزة (لو شاكك إن حد معاه الجلسة). */
  async logoutAll(adminId: string, ip?: string) {
    const admin = await this.getAdmin(adminId);
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1;
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_SESSIONS_REVOKED',
      'master_admin',
      admin.id,
      {},
      ip,
      'warning'
    );
  }

  // ---------- Two-factor authentication (TOTP) ----------
  async twoFactorSetup(adminId: string, password: string, ip?: string) {
    const admin = await this.getAdmin(adminId);
    await this.assertPassword(admin, password);
    if (admin.totpEnabled) throw new ForbiddenException('المصادقة الثنائية مفعّلة بالفعل');
    const secret = generateTotpSecret();
    admin.totpSecret = encryptSecret(secret, this.totpKey);
    admin.totpEnabled = false;
    admin.totpLastStep = null;
    await this.admins.save(admin);
    await this.audit(admin.email, 'MASTER_2FA_SETUP_STARTED', 'master_admin', admin.id, {}, ip);
    return { secret, otpauthUrl: totpUri(secret, admin.email, 'Blink ERP Admin') };
  }

  async twoFactorEnable(adminId: string, otp: string, ip?: string) {
    const admin = await this.getAdmin(adminId);
    if (!admin.totpSecret) throw new ForbiddenException('ابدأ إعداد المصادقة الثنائية أولاً');
    const step = verifyTotp(decryptSecret(admin.totpSecret, this.totpKey), otp);
    if (step === null) throw new UnauthorizedException('رمز المصادقة غير صحيح');
    admin.totpEnabled = true;
    admin.totpLastStep = String(step);
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1; // أي جلسة قديمة بدون 2FA تخرج
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_2FA_ENABLED',
      'master_admin',
      admin.id,
      {},
      ip,
      'warning'
    );
    return { accessToken: this.signToken(admin) };
  }

  async twoFactorDisable(adminId: string, password: string, otp: string, ip?: string) {
    const admin = await this.getAdmin(adminId);
    await this.assertPassword(admin, password);
    if (!admin.totpEnabled || !admin.totpSecret) return;
    const step = verifyTotp(decryptSecret(admin.totpSecret, this.totpKey), otp, {
      lastUsedStep: admin.totpLastStep != null ? Number(admin.totpLastStep) : null,
    });
    if (step === null) throw new UnauthorizedException('رمز المصادقة غير صحيح');
    admin.totpEnabled = false;
    admin.totpSecret = null;
    admin.totpLastStep = null;
    await this.admins.save(admin);
    await this.audit(
      admin.email,
      'MASTER_2FA_DISABLED',
      'master_admin',
      admin.id,
      {},
      ip,
      'warning'
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

  async assertTenantExists(id: string): Promise<void> {
    await this.getTenant(id);
  }

  /** حدود الحساب: عدد المستخدمين/الفروع/المخازن (null = بدون حد). */
  async setTenantLimits(id: string, dto: TenantLimitsDto, adminEmail: string, ip: string) {
    const tenant = await this.getTenant(id);
    const before = {
      maxUsers: tenant.maxUsers ?? null,
      maxBranches: tenant.maxBranches ?? null,
      maxWarehouses: tenant.maxWarehouses ?? null,
    };
    if (dto.maxUsers !== undefined) tenant.maxUsers = dto.maxUsers;
    if (dto.maxBranches !== undefined) tenant.maxBranches = dto.maxBranches;
    if (dto.maxWarehouses !== undefined) tenant.maxWarehouses = dto.maxWarehouses;
    const saved = await this.tenants.save(tenant);
    await this.audit(adminEmail, 'TENANT_LIMITS_UPDATED', 'tenant', id, { before, after: dto }, ip);
    return saved;
  }

  /** ملخص الاستخدام مقابل الحدود + أمان الحساب (للوحة المدير العام). */
  async tenantUsage(id: string) {
    const tenant = await this.getTenant(id);
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND deleted_at IS NULL) AS users,
         (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active) AS "activeUsers",
         (SELECT COUNT(*)::int FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL) AS branches,
         (SELECT COUNT(*)::int FROM warehouses WHERE tenant_id = $1 AND deleted_at IS NULL) AS warehouses,
         (SELECT COUNT(*)::int FROM products WHERE tenant_id = $1 AND deleted_at IS NULL) AS products,
         (SELECT COUNT(*)::int FROM api_keys WHERE tenant_id = $1 AND revoked_at IS NULL AND deleted_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())) AS "activeApiKeys",
         (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1 AND description = 'tenant'
            AND action = 'TENANT_LOGIN_FAILED' AND created_at > NOW() - INTERVAL '24 hours') AS "failedLogins24h"`,
      [id]
    );
    return {
      usage: row,
      limits: {
        maxUsers: tenant.maxUsers ?? null,
        maxBranches: tenant.maxBranches ?? null,
        maxWarehouses: tenant.maxWarehouses ?? null,
      },
    };
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

  // ---------- Tenant backup, restore and permanent deletion ----------
  private quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /** جداول ربط بدون tenant_id لكن تابعة للتاجر عن طريق users/roles. */
  private static readonly LINK_TABLES: Record<string, { column: string; parent: string }[]> = {
    user_roles: [
      { column: 'user_id', parent: 'users' },
      { column: 'role_id', parent: 'roles' },
    ],
    role_permissions: [{ column: 'role_id', parent: 'roles' }],
  };

  /** جداول ممنوع استعادتها حتى لو فيها tenant_id (أسرار أو سجلات نظام). */
  private static readonly RESTORE_DENYLIST = new Set(['audit_logs', 'api_keys', 'master_admins']);

  private async tenantScopedTables(): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT table_name::text AS table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='tenant_id' ORDER BY 1`
    );
    return rows
      .map((r: any) => String(r.table_name))
      .filter((t: string) => !MasterAdminService.RESTORE_DENYLIST.has(t));
  }

  async backupTenant(id: string, adminEmail: string, ip: string) {
    await this.getTenant(id);
    const tables = await this.tenantScopedTables();
    const backup: any = {
      format: 'blink-erp-tenant-backup',
      version: 1,
      tenantId: id,
      exportedAt: new Date().toISOString(),
      tables: {},
    };
    backup.tables.tenants = await this.dataSource.query('SELECT * FROM tenants WHERE id = $1', [
      id,
    ]);
    for (const table of tables)
      backup.tables[table] = await this.dataSource.query(
        `SELECT * FROM ${this.quoteIdentifier(table)} WHERE tenant_id = $1`,
        [id]
      );
    backup.tables.user_roles = await this.dataSource.query(
      `SELECT ur.* FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.tenant_id = $1`,
      [id]
    );
    backup.tables.role_permissions = await this.dataSource.query(
      `SELECT rp.* FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.tenant_id = $1`,
      [id]
    );
    await this.audit(
      adminEmail,
      'TENANT_BACKUP_EXPORTED',
      'tenant',
      id,
      { tables: Object.keys(backup.tables) },
      ip
    );
    return backup;
  }

  async deleteTenant(id: string, businessName: string, adminEmail: string, ip: string) {
    const tenant = await this.getTenant(id);
    if (businessName !== tenant.businessName)
      throw new ForbiddenException('اسم النشاط التجاري غير مطابق');
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM tenants WHERE id = $1', [id]);
      await manager.query(
        `INSERT INTO audit_logs (user_email,user_ip,action,entity_type,entity_id,new_values,description,severity) VALUES ($1,$2,'TENANT_DELETED','tenant',$3,$4,'master_admin','warning')`,
        [adminEmail, ip || null, id, JSON.stringify({ businessName })]
      );
    });
  }

  /** يحوّل قيمة أعمدة قادمة من pg (قد تكون نصاً مثل "{a,b,c}" أو مصفوفة) إلى مصفوفة نصوص. */
  private static parsePgTextArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v));
    return String(value ?? '')
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((s) => s.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
  }

  /** ترتيب الجداول بحيث تُدرَج الجداول الأم قبل الأبناء (حسب قيود الـ FK) لتجنب كسر القيود أثناء الاستعادة. */
  private orderTablesForRestore(
    tables: string[],
    fkRows: { child: string; parent: string }[]
  ): string[] {
    const inSet = new Set(tables);
    const parents = new Map<string, Set<string>>();
    for (const t of tables) parents.set(t, new Set());
    for (const { child, parent } of fkRows) {
      if (child !== parent && inSet.has(child) && inSet.has(parent))
        parents.get(child)!.add(parent);
    }
    const ordered: string[] = [];
    const done = new Set<string>();
    let remaining = [...tables].sort();
    while (remaining.length) {
      const ready = remaining.filter((t) => [...parents.get(t)!].every((p) => done.has(p)));
      // لو فيه دورة (cycle) نكسرها بإدراج أول جدول متبقٍ بدل التعليق للأبد
      const batch = ready.length ? ready : [remaining[0]];
      for (const t of batch) {
        ordered.push(t);
        done.add(t);
      }
      remaining = remaining.filter((t) => !done.has(t));
    }
    return ordered;
  }

  async restoreTenant(backup: any, adminEmail: string, ip: string) {
    if (
      !backup ||
      backup.format !== 'blink-erp-tenant-backup' ||
      backup.version !== 1 ||
      !backup.tenantId ||
      !backup.tables?.tenants?.length
    )
      throw new ForbiddenException('ملف النسخة الاحتياطية غير صالح');
    const tenantId = String(backup.tenantId);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new ForbiddenException('معرّف التاجر غير صالح');
    if (await this.tenants.findOne({ where: { id: tenantId }, withDeleted: true }))
      throw new ForbiddenException('Tenant ID موجود بالفعل');

    // أمان: الاستعادة مسموحة فقط لجداول التاجر (فيها tenant_id) + tenants + جداول الربط.
    // أي جدول نظام (master_admins / permissions / features / plans ...) مرفوض تماماً،
    // وإلا ملف نسخة احتياطية معدَّل كان ممكن يزرع مدير عام جديد أو يغيّر صلاحيات النظام.
    const scoped = new Set(await this.tenantScopedTables());
    for (const table of Object.keys(backup.tables)) {
      if (table === 'tenants' || scoped.has(table) || MasterAdminService.LINK_TABLES[table])
        continue;
      throw new ForbiddenException(`جدول غير مسموح في النسخة الاحتياطية: ${table}`);
    }
    if (backup.tables.tenants.length !== 1 || backup.tables.tenants[0]?.id !== tenantId)
      throw new ForbiddenException('بيانات التاجر في النسخة غير متطابقة');
    for (const [table, rows] of Object.entries(backup.tables) as [string, any[]][]) {
      if (!Array.isArray(rows)) throw new ForbiddenException(`بيانات الجدول ${table} غير صالحة`);
      if (table === 'tenants' || MasterAdminService.LINK_TABLES[table]) continue;
      for (const row of rows)
        if (!row || row.tenant_id !== tenantId)
          throw new ForbiddenException('النسخة تحتوي سجلات لتاجر آخر أو بدون تاجر');
    }
    // جداول الربط: كل مرجع لازم يشاور على سجل موجود داخل نفس النسخة
    for (const [table, refs] of Object.entries(MasterAdminService.LINK_TABLES)) {
      for (const row of (backup.tables[table] || []) as any[]) {
        for (const ref of refs) {
          const ids = new Set(((backup.tables[ref.parent] || []) as any[]).map((r) => r.id));
          if (!ids.has(row?.[ref.column]))
            throw new ForbiddenException(`سجل ربط في ${table} يشير لبيانات خارج النسخة`);
        }
      }
      // role_permissions: الصلاحية نفسها لازم تكون صلاحية نظام موجودة
      if (table === 'role_permissions') {
        const permIds = new Set(
          (await this.dataSource.query('SELECT id FROM permissions')).map((p: any) => p.id)
        );
        for (const row of (backup.tables[table] || []) as any[])
          if (!permIds.has(row.permission_id))
            throw new ForbiddenException('صلاحية غير معروفة في النسخة الاحتياطية');
      }
    }

    // ملاحظة: نعمل cast إلى ::text لأن node-postgres يرجّع name[] كنص خام "{a,b,c}" وليس مصفوفة
    // ونستبعد الأعمدة المولّدة تلقائياً (GENERATED ALWAYS) لأن Postgres يرفض إدخال قيم فيها
    const allowed = await this.dataSource.query(
      `SELECT table_name::text AS table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND is_generated = 'NEVER' AND (identity_generation IS NULL OR identity_generation <> 'ALWAYS') GROUP BY table_name`
    );
    const columns = new Map<string, Set<string>>(
      allowed.map((x: any): [string, Set<string>] => [
        String(x.table_name),
        new Set<string>(MasterAdminService.parsePgTextArray(x.columns)),
      ])
    );

    // اعتماديات الـ FK بين الجداول لترتيب الإدراج (الآباء أولاً)
    const fkRows: { child: string; parent: string }[] = await this.dataSource.query(`
      SELECT tc.table_name::text AS child, ccu.table_name::text AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);

    const tableNames = ['tenants', ...Object.keys(backup.tables).filter((t) => t !== 'tenants')];
    for (const table of tableNames) {
      if (!columns.has(table) || !/^[a-zA-Z0-9_]+$/.test(table))
        throw new ForbiddenException(`جدول غير مسموح: ${table}`);
    }
    const ordered = this.orderTablesForRestore(tableNames, fkRows);

    let insertedRows = 0;
    await this.dataSource.transaction(async (manager) => {
      for (const table of ordered) {
        const tableColumns = columns.get(table)!;
        for (const row of backup.tables[table] || []) {
          const keys = Object.keys(row).filter((k) => tableColumns.has(k));
          if (!keys.length) continue;
          await manager.query(
            `INSERT INTO ${this.quoteIdentifier(table)} (${keys.map((k) => this.quoteIdentifier(k)).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
            keys.map((k) => row[k])
          );
          insertedRows++;
        }
      }
      // حماية: لو ما اتسجّلش صف التاجر نفسه، الاستعادة تعتبر فاشلة ونرجع كل حاجة
      const [check] = await manager.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
      if (!check || !insertedRows)
        throw new ForbiddenException('فشلت الاستعادة: لم يتم إدراج أي بيانات من الملف');
      await manager.query(
        `INSERT INTO audit_logs (user_email,user_ip,action,entity_type,entity_id,new_values,description,severity) VALUES ($1,$2,'TENANT_BACKUP_RESTORED','tenant',$3,$4,'master_admin','warning')`,
        [adminEmail, ip || null, tenantId, JSON.stringify({ tables: ordered, insertedRows })]
      );
    });
    return { insertedRows, tables: ordered.length };
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
