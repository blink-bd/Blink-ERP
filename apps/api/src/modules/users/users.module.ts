import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { Branch } from '@/modules/inventory/entities/branch.entity';
import { Warehouse } from '@/modules/inventory/entities/warehouse.entity';
import { AccessScopeService } from './access-scope.service';
import { UsersService } from './users.service';
import { UserManagementService } from './user-management.service';
import { UsersController, RolesController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission, Tenant, Branch, Warehouse])],
  controllers: [UsersController, RolesController],
  providers: [UsersService, UserManagementService, AccessScopeService],
  exports: [UsersService, AccessScopeService],
})
export class UsersModule {}
