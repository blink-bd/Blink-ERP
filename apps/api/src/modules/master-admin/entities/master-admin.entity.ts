import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('master_admins')
export class MasterAdmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil?: Date;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ name: 'last_login_ip', length: 45, nullable: true })
  lastLoginIp?: string;

  /** بيزيد عند تغيير كلمة المرور أو "تسجيل الخروج من كل الأجهزة" => كل التوكنات القديمة تبطل */
  @Column({ name: 'session_version', type: 'int', default: 0 })
  sessionVersion: number;

  /** سر المصادقة الثنائية (TOTP) — مشفّر بـ AES-256-GCM */
  @Column({ name: 'totp_secret', type: 'text', nullable: true })
  totpSecret?: string | null;

  @Column({ name: 'totp_enabled', default: false })
  totpEnabled: boolean;

  /** آخر خطوة زمنية استُخدم فيها رمز (يمنع إعادة استخدام نفس الرمز) */
  @Column({ name: 'totp_last_step', type: 'bigint', nullable: true })
  totpLastStep?: string | null;

  @Column({ name: 'password_changed_at', type: 'timestamp', nullable: true })
  passwordChangedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
