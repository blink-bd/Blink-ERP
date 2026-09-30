import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MasterAdmin } from './entities/master-admin.entity';
import { Tenant } from '@/modules/tenants/entities/tenant.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Plan } from '@/modules/features/entities/plan.entity';
import { Feature } from '@/modules/features/entities/feature.entity';
import { UsersModule } from '@/modules/users/users.module';
import { MasterAdminService } from './master-admin.service';
import { MasterAdminGuard } from './master-admin.guard';
import { MasterAuthController, MasterAdminController } from './master-admin.controller';

/** Global: عشان الـ Guard يتستخدم في أي Controller خاص بالمدير العام. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MasterAdmin, Tenant, User, Plan, Feature]), JwtModule.register({}), UsersModule],
  controllers: [MasterAuthController, MasterAdminController],
  providers: [MasterAdminService, MasterAdminGuard],
  exports: [MasterAdminService, MasterAdminGuard],
})
export class MasterAdminModule {}
