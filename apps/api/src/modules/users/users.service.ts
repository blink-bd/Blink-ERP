import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';

interface CreateUserInput {
  tenantId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: ['tenant', 'roles', 'roles.permissions'],
    });
  }

  async findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email, tenantId },
      relations: ['tenant', 'roles', 'roles.permissions'],
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: input.email, tenantId: input.tenantId },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists in this tenant');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = this.usersRepository.create({
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
    });

    return this.usersRepository.save(user);
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
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await this.usersRepository.update(userId, {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: (() => 'NULL') as any,
    });
  }
}
