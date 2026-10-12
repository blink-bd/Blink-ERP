import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { typeormConfig } from './config/typeorm.config';
import { CommonModule } from './common/common.module';

import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { FeaturesModule } from './modules/features/features.module';
import { BrandingModule } from './modules/branding/branding.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BackupModule } from './modules/backup/backup.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MasterAdminModule } from './modules/master-admin/master-admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { DataTransferModule } from './modules/data-transfer/data-transfer.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { HealthModule } from './modules/health/health.module';
import { BalanceRemindersModule } from './modules/balance-reminders/balance-reminders.module';
import { InvoiceAttachmentsModule } from './modules/invoice-attachments/invoice-attachments.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: typeormConfig,
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: Number(process.env.THROTTLE_LIMIT) || 300,
      },
    ]),
    CommonModule,
    AuditModule,
    ApiKeysModule,
    MasterAdminModule,
    NotificationsModule,
    BalanceRemindersModule,
    InvoiceAttachmentsModule,
    MaintenanceModule,
    IntegrationsModule,
    ReceiptsModule,
    HealthModule,
    DashboardModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    FeaturesModule,
    BrandingModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    SuppliersModule,
    SalesModule,
    PurchasesModule,
    CashRegisterModule,
    ExpensesModule,
    ReportsModule,
    BackupModule,
    DataTransferModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
