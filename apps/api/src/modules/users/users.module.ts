import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { UsersService } from './users.service';
import { UserManagementService } from './user-management.service';
import { UsersController, RolesController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission, Tenant])],
  controllers: [UsersController, RolesController],
  providers: [UsersService, UserManagementService],
  exports: [UsersService],
})
export class UsersModule {}
