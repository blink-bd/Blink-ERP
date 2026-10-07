import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { User } from '@/modules/users/entities/user.entity';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ name: 'business_name', length: 255 })
  businessName: string;

  @Column({ name: 'business_name_ar', length: 255 })
  businessNameAr: string;

  @Column({ name: 'business_name_en', length: 255, nullable: true })
  businessNameEn?: string;

  @Column({ name: 'trade_name', length: 255, nullable: true })
  tradeName?: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ length: 100, nullable: true })
  city?: string;

  @Column({ length: 100, default: 'Saudi Arabia' })
  country: string;

  @Column({ length: 3, default: 'SAR' })
  currency: string;

  @Column({ length: 50, default: 'Asia/Riyadh' })
  timezone: string;

  @Column({ name: 'default_language', length: 5, default: 'ar' })
  defaultLanguage: string;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId?: string;

  @Column({ name: 'subscription_start_date', type: 'timestamp', nullable: true })
  subscriptionStartDate?: Date;

  @Column({ name: 'subscription_end_date', type: 'timestamp', nullable: true })
  subscriptionEndDate?: Date;

  @Column({
    name: 'subscription_status',
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  subscriptionStatus: 'active' | 'expired' | 'suspended' | 'cancelled';

  /** المبلغ اللي المدير العام بيحدده بنفسه للبيع للتاجر (مش من خطة جاهزة) */
  @Column({ name: 'subscription_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  subscriptionAmount?: number;

  /** الدورة: شهري أو سنوي */
  @Column({ name: 'subscription_cycle', length: 20, nullable: true })
  subscriptionCycle?: 'monthly' | 'yearly';

  /** ملحوظة توضح المبلغ ده بتاع إيه */
  @Column({ name: 'subscription_note', type: 'text', nullable: true })
  subscriptionNote?: string;

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
  trialEndsAt?: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];
}
