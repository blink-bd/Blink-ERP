import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';

@Entity('branches')
export class Branch extends TenantBaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code?: string;

  @Column({ length: 50, nullable: true })
  phone?: string;

  @Column({ length: 255, nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ length: 100, nullable: true })
  city?: string;

  @Column({ name: 'is_main', default: false })
  isMain: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
