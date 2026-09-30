import { Entity, Column, ManyToMany } from 'typeorm';
import { BaseEntity } from '@/database/entities/base.entity';
import { Role } from './role.entity';

@Entity('permissions')
export class Permission extends BaseEntity {
  @Column({ length: 100 })
  resource: string;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 20, default: 'all' })
  scope: 'own' | 'branch' | 'all';

  @Column({ unique: true, length: 255 })
  name: string;

  @Column({ length: 500, nullable: true })
  description?: string;

  @Column({ length: 50, nullable: true })
  category?: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
