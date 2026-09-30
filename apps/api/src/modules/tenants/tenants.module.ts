import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { PaymentMethod } from '@/modules/sales/entities/payment-method.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { UsersModule } from '@/modules/users/users.module';
import { FeaturesModule } from '@/modules/features/features.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, PaymentMethod]),
    UsersModule,
    FeaturesModule,
    InventoryModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
