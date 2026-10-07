import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';

interface CreateUserInput {
  tenantId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  assignOwnerRole?: boolean;
}

const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: ['tenant', 'roles', 'roles.permissions'],
    });
  }

  async findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase().trim(), tenantId },
      relations: ['tenant', 'roles', 'roles.permissions'],
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.usersRepository.findOne({
      where: { email, tenantId: input.tenantId },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists in this tenant');
    }

    const user = this.usersRepository.create({
      tenantId: input.tenantId,
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      phone: input.phone,
    });

    const saved = await this.usersRepository.save(user);
    if (input.assignOwnerRole) {
      await this.assignOwnerRole(input.tenantId, saved.id);
    }

    return (await this.findById(saved.id)) as User;
  }

  /**
   * The first tenant administrator receives a real role, not an implicit
   * frontend-only privilege. Existing roleless users are backfilled by the
   * corresponding database migration.
   */
  async assignOwnerRole(tenantId: string, userId: string): Promise<void> {
    let role = await this.rolesRepository.findOne({
      where: { tenantId, name: 'owner' },
      relations: ['permissions'],
    });

    const permissions = await this.permissionsRepository.find();
    if (!role) {
      role = this.rolesRepository.create({
        tenantId,
        name: 'owner',
        nameAr: 'مالك النظام',
        description: 'صلاحيات كاملة داخل التاجر',
        isSystem: true,
        permissions,
      });
    } else {
      role.permissions = permissions;
    }

    const savedRole = await this.rolesRepository.save(role);
    await this.usersRepository.manager.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, savedRole.id]
    );
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    try {
      return await argon2.verify(user.passwordHash, password);
    } catch {
      return false;
    }
  }

  async recordSuccessfulLogin(userId: string, ip: string): Promise<void> {
    await this.usersRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return;

    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
    await this.usersRepository.save(user);
  }

  async isLocked(user: User): Promise<boolean> {
    if (!user.lockedUntil) return false;
    if (new Date() > user.lockedUntil) {
      await this.usersRepository.update(user.id, {
        lockedUntil: undefined,
        failedLoginAttempts: 0,
      });
      return false;
    }
    return true;
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    await this.usersRepository.update(userId, {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: (() => 'NULL') as any,
      sessionVersion: (() => 'session_version + 1') as any,
    });
  }

  async revokeSessions(userId: string): Promise<void> {
    await this.usersRepository.increment({ id: userId }, 'sessionVersion', 1);
  }
}
