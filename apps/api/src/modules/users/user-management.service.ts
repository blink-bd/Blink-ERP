import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UsersService } from './users.service';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { assertStrongPassword } from '@/common/utils/password-policy';
import { AuditService, actorFromRequest } from '@/modules/audit/audit.service';
import {
  CreateTenantUserDto,
  RoleDto,
  UpdateRoleDto,
  UpdateTenantUserDto,
} from './dto/user-management.dto';
import { PERMISSION_CATEGORY_LABELS, PERMISSION_LABELS } from './permission-labels';

export interface Actor {
  id: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

const OWNER_ROLE = 'owner';

/**
 * إدارة مستخدمي وأدوار التاجر مع منع تصعيد الصلاحيات:
 * - لا يمكن لأي مستخدم منح دور/صلاحية لا يملكها هو نفسه.
 * - لا يمكن لأي مستخدم إدارة (تعديل/إيقاف/تغيير كلمة مرور/حذف) مستخدم عنده
 *   صلاحيات أعلى منه — يمنع مثلاً كاشير عنده users.update من تغيير كلمة مرور المالك
 *   والاستيلاء على الحساب.
 * - دور المالك (owner) لا يمنحه ولا يديره إلا مالك، ولا يمكن إيقاف/حذف آخر مالك.
 */
@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly usersService: UsersService,
    private readonly audit: AuditService
  ) {}

  private isOwner(actor: Actor) {
    return (actor.roles || []).includes(OWNER_ROLE);
  }

  private permsOf(user: User): Set<string> {
    return new Set((user.roles || []).flatMap((r) => (r.permissions || []).map((p) => p.name)));
  }

  private assertCanManage(actor: Actor, target: User) {
    const targetIsOwner = (target.roles || []).some((r) => r.name === OWNER_ROLE);
    if (targetIsOwner && !this.isOwner(actor)) {
      throw new ForbiddenException('لا يمكن إدارة حساب المالك إلا بواسطة مالك');
    }
    if (!this.isOwner(actor)) {
      const actorPerms = new Set(actor.permissions);
      const higher = Array.from(this.permsOf(target)).filter((p) => !actorPerms.has(p));
      if (higher.length) {
        throw new ForbiddenException('لا يمكنك إدارة مستخدم لديه صلاحيات أعلى من صلاحياتك');
      }
    }
  }

  private async loadRolesForAssignment(actor: Actor, roleIds: string[]): Promise<Role[]> {
    const ids = Array.from(new Set(roleIds || []));
    if (!ids.length) return [];
    const roles = await this.roles.find({
      where: { id: In(ids), tenantId: actor.tenantId, deletedAt: IsNull() },
      relations: ['permissions'],
    });
    if (roles.length !== ids.length) throw new BadRequestException('دور غير موجود لهذا الحساب');
    const actorPerms = new Set(actor.permissions);
    for (const role of roles) {
      if (role.name === OWNER_ROLE && !this.isOwner(actor)) {
        throw new ForbiddenException('دور المالك لا يمنحه إلا مالك');
      }
      if (!this.isOwner(actor)) {
        const exceeding = (role.permissions || []).filter((p) => !actorPerms.has(p.name));
        if (exceeding.length) {
          throw new ForbiddenException(
            `لا يمكنك منح الدور "${role.nameAr}" لأنه يحتوي صلاحيات لا تملكها`
          );
        }
      }
    }
    return roles;
  }

  private async getTarget(tenantId: string, id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: ['roles', 'roles.permissions'],
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  private async activeOwnersCount(tenantId: string, excludeUserId?: string): Promise<number> {
    const [row] = await this.users.manager.query(
      `SELECT COUNT(DISTINCT u.id)::int AS c FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = true
         AND r.name = '${OWNER_ROLE}' AND r.tenant_id = $1 AND ($2::uuid IS NULL OR u.id <> $2::uuid)`,
      [tenantId, excludeUserId || null]
    );
    return row?.c || 0;
  }

  private async assertSeatAvailable(tenantId: string) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant?.maxUsers) return;
    const active = await this.users.count({
      where: { tenantId, isActive: true, deletedAt: IsNull() },
    });
    if (active >= tenant.maxUsers) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message: `وصلت للحد الأقصى لعدد المستخدمين (${tenant.maxUsers}). تواصل مع الإدارة لزيادته`,
      });
    }
  }

  private async assertBranchWarehouse(
    tenantId: string,
    branchId?: string | null,
    warehouseId?: string | null
  ) {
    if (branchId) {
      const [b] = await this.users.manager.query(
        `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [branchId, tenantId]
      );
      if (!b) throw new BadRequestException('الفرع غير موجود');
    }
    if (warehouseId) {
      const [w] = await this.users.manager.query(
        `SELECT id FROM warehouses WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [warehouseId, tenantId]
      );
      if (!w) throw new BadRequestException('المخزن غير موجود');
    }
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      isActive: user.isActive,
      branchId: user.branchId,
      warehouseId: user.warehouseId,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil : null,
      createdAt: user.createdAt,
      roles: (user.roles || []).map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr })),
    };
  }

  // ------------------------------------------------------------------ users
  async listUsers(tenantId: string) {
    const rows = await this.users.find({
      where: { tenantId, deletedAt: IsNull() },
      relations: ['roles'],
      order: { createdAt: 'ASC' },
    });
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    return {
      users: rows.map((u) => this.toPublic(u)),
      limits: {
        maxUsers: tenant?.maxUsers ?? null,
        activeUsers: rows.filter((u) => u.isActive).length,
      },
    };
  }

  async createUser(actor: Actor, dto: CreateTenantUserDto, req: any) {
    assertStrongPassword(dto.password);
    await this.assertSeatAvailable(actor.tenantId);
    const roles = await this.loadRolesForAssignment(actor, dto.roleIds);
    await this.assertBranchWarehouse(actor.tenantId, dto.branchId, dto.warehouseId);

    const email = dto.email.toLowerCase().trim();
    const exists = await this.users.findOne({
      where: { tenantId: actor.tenantId, email },
      withDeleted: true,
    });
    if (exists) throw new ConflictException('يوجد مستخدم بنفس البريد الإلكتروني');

    const created = await this.usersService.create({
      tenantId: actor.tenantId,
      email,
      password: dto.password,
      fullName: dto.fullName,
      phone: dto.phone,
    });
    created.roles = roles;
    created.branchId = dto.branchId ?? undefined;
    created.warehouseId = dto.warehouseId ?? undefined;
    await this.users.save(created);

    await this.audit.log({
      ...actorFromRequest(req),
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: created.id,
      newValues: { email, fullName: dto.fullName, roles: roles.map((r) => r.name) },
      severity: 'warning',
    });
    return this.toPublic(await this.getTarget(actor.tenantId, created.id));
  }

  async updateUser(actor: Actor, id: string, dto: UpdateTenantUserDto, req: any) {
    const target = await this.getTarget(actor.tenantId, id);
    this.assertCanManage(actor, target);
    const before = this.toPublic(target);
    let revoke = false;

    if (dto.isActive === false && target.isActive) {
      if (target.id === actor.id) throw new BadRequestException('لا يمكنك إيقاف حسابك بنفسك');
      const isOwner = (target.roles || []).some((r) => r.name === OWNER_ROLE);
      if (isOwner && (await this.activeOwnersCount(actor.tenantId, target.id)) === 0) {
        throw new BadRequestException('لا يمكن إيقاف آخر مالك للحساب');
      }
      revoke = true;
    }
    if (dto.isActive === true && !target.isActive) await this.assertSeatAvailable(actor.tenantId);

    if (dto.roleIds) {
      const roles = await this.loadRolesForAssignment(actor, dto.roleIds);
      const wasOwner = (target.roles || []).some((r) => r.name === OWNER_ROLE);
      const willBeOwner = roles.some((r) => r.name === OWNER_ROLE);
      if (wasOwner && !willBeOwner) {
        if ((await this.activeOwnersCount(actor.tenantId, target.id)) === 0) {
          throw new BadRequestException('لا يمكن إزالة دور المالك من آخر مالك للحساب');
        }
      }
      if (target.id === actor.id && wasOwner && !willBeOwner) {
        throw new BadRequestException('لا يمكنك إزالة دور المالك من نفسك');
      }
      target.roles = roles;
    }

    await this.assertBranchWarehouse(actor.tenantId, dto.branchId, dto.warehouseId);
    if (dto.fullName !== undefined) target.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) target.phone = dto.phone;
    if (dto.isActive !== undefined) target.isActive = dto.isActive;
    if (dto.branchId !== undefined) target.branchId = dto.branchId ?? (null as any);
    if (dto.warehouseId !== undefined) target.warehouseId = dto.warehouseId ?? (null as any);
    await this.users.save(target);
    if (revoke) await this.usersService.revokeSessions(target.id);

    const after = this.toPublic(await this.getTarget(actor.tenantId, id));
    await this.audit.log({
      ...actorFromRequest(req),
      action: dto.roleIds ? 'USER_ROLES_CHANGED' : 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      oldValues: before,
      newValues: after,
      severity: dto.roleIds || dto.isActive !== undefined ? 'warning' : 'info',
    });
    return after;
  }

  async resetPassword(actor: Actor, id: string, newPassword: string, req: any) {
    const target = await this.getTarget(actor.tenantId, id);
    if (target.id === actor.id) {
      throw new BadRequestException('لتغيير كلمة مرورك استخدم "تغيير كلمة المرور" في الإعدادات');
    }
    this.assertCanManage(actor, target);
    assertStrongPassword(newPassword);
    await this.usersService.setPassword(target.id, newPassword); // يبطل كل جلساته
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'USER_PASSWORD_RESET',
      entityType: 'user',
      entityId: id,
      newValues: { email: target.email },
      severity: 'warning',
    });
  }

  async revokeUserSessions(actor: Actor, id: string, req: any) {
    const target = await this.getTarget(actor.tenantId, id);
    this.assertCanManage(actor, target);
    await this.usersService.revokeSessions(target.id);
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'USER_SESSIONS_REVOKED',
      entityType: 'user',
      entityId: id,
      severity: 'warning',
    });
  }

  async deleteUser(actor: Actor, id: string, req: any) {
    const target = await this.getTarget(actor.tenantId, id);
    if (target.id === actor.id) throw new BadRequestException('لا يمكنك حذف حسابك بنفسك');
    this.assertCanManage(actor, target);
    const isOwner = (target.roles || []).some((r) => r.name === OWNER_ROLE);
    if (isOwner && (await this.activeOwnersCount(actor.tenantId, target.id)) === 0) {
      throw new BadRequestException('لا يمكن حذف آخر مالك للحساب');
    }
    await this.usersService.revokeSessions(target.id);
    await this.users.update(target.id, { isActive: false });
    await this.users.softDelete(target.id);
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'USER_DELETED',
      entityType: 'user',
      entityId: id,
      newValues: { email: target.email },
      severity: 'warning',
    });
  }

  // ------------------------------------------------------------------ roles
  async listPermissions() {
    const all = await this.permissions.find({ order: { category: 'ASC', name: 'ASC' } });
    return all.map((p) => ({
      name: p.name,
      label: PERMISSION_LABELS[p.name] || p.name,
      category: p.category || 'other',
      categoryLabel: PERMISSION_CATEGORY_LABELS[p.category || ''] || p.category || 'أخرى',
    }));
  }

  async listRoles(tenantId: string) {
    const roles = await this.roles.find({
      where: { tenantId, deletedAt: IsNull() },
      relations: ['permissions'],
      order: { createdAt: 'ASC' },
    });
    const counts: { role_id: string; c: number }[] = await this.users.manager.query(
      `SELECT ur.role_id, COUNT(*)::int AS c FROM user_roles ur
       JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
       WHERE u.tenant_id = $1 GROUP BY ur.role_id`,
      [tenantId]
    );
    const countMap = new Map(counts.map((r) => [r.role_id, r.c]));
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      description: r.description,
      isSystem: r.isSystem,
      usersCount: countMap.get(r.id) || 0,
      permissions: (r.permissions || []).map((p) => p.name),
    }));
  }

  private async resolvePermissions(actor: Actor, names: string[]): Promise<Permission[]> {
    const unique = Array.from(new Set(names || []));
    const perms = unique.length ? await this.permissions.find({ where: { name: In(unique) } }) : [];
    if (perms.length !== unique.length) throw new BadRequestException('صلاحية غير معروفة');
    if (!this.isOwner(actor)) {
      const actorPerms = new Set(actor.permissions);
      const exceeding = unique.filter((p) => !actorPerms.has(p));
      if (exceeding.length) {
        throw new ForbiddenException(`لا يمكنك منح صلاحيات لا تملكها: ${exceeding.join(', ')}`);
      }
    }
    return perms;
  }

  async createRole(actor: Actor, dto: RoleDto, req: any) {
    const name = dto.name.trim().toLowerCase();
    if (name === OWNER_ROLE) throw new BadRequestException('اسم الدور محجوز');
    const exists = await this.roles.findOne({ where: { tenantId: actor.tenantId, name } });
    if (exists) throw new ConflictException('يوجد دور بنفس الاسم');
    const role = this.roles.create({
      tenantId: actor.tenantId,
      name,
      nameAr: dto.nameAr.trim(),
      description: dto.description,
      isSystem: false,
      createdBy: actor.id,
      permissions: await this.resolvePermissions(actor, dto.permissions),
    });
    const saved = await this.roles.save(role);
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'ROLE_CREATED',
      entityType: 'role',
      entityId: saved.id,
      newValues: { name, permissions: dto.permissions },
      severity: 'warning',
    });
    return (await this.listRoles(actor.tenantId)).find((r) => r.id === saved.id);
  }

  async updateRole(actor: Actor, id: string, dto: UpdateRoleDto, req: any) {
    const role = await this.roles.findOne({
      where: { id, tenantId: actor.tenantId, deletedAt: IsNull() },
      relations: ['permissions'],
    });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem || role.name === OWNER_ROLE) {
      throw new ForbiddenException('أدوار النظام لا يمكن تعديلها');
    }
    const before = (role.permissions || []).map((p) => p.name);
    if (dto.nameAr !== undefined) role.nameAr = dto.nameAr.trim();
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissions) {
      // غير المالك ماينفعش يعدّل دور فيه صلاحيات أعلى منه حتى لو هيشيلها
      if (!this.isOwner(actor)) {
        const actorPerms = new Set(actor.permissions);
        if (before.some((p) => !actorPerms.has(p))) {
          throw new ForbiddenException('لا يمكنك تعديل دور يحتوي صلاحيات أعلى من صلاحياتك');
        }
      }
      role.permissions = await this.resolvePermissions(actor, dto.permissions);
    }
    role.updatedBy = actor.id;
    await this.roles.save(role);
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'ROLE_UPDATED',
      entityType: 'role',
      entityId: id,
      oldValues: { permissions: before },
      newValues: { permissions: dto.permissions },
      severity: 'warning',
    });
    return (await this.listRoles(actor.tenantId)).find((r) => r.id === id);
  }

  async deleteRole(actor: Actor, id: string, req: any) {
    const role = await this.roles.findOne({
      where: { id, tenantId: actor.tenantId, deletedAt: IsNull() },
    });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem || role.name === OWNER_ROLE)
      throw new ForbiddenException('أدوار النظام لا يمكن حذفها');
    const [{ c }] = await this.users.manager.query(
      `SELECT COUNT(*)::int AS c FROM user_roles ur JOIN users u ON u.id = ur.user_id
       WHERE ur.role_id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    if (c > 0) throw new BadRequestException(`الدور مستخدم مع ${c} مستخدم. غيّر أدوارهم أولاً`);
    await this.users.manager.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
    await this.roles.softDelete(id);
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'ROLE_DELETED',
      entityType: 'role',
      entityId: id,
      newValues: { name: role.name },
      severity: 'warning',
    });
  }
}
