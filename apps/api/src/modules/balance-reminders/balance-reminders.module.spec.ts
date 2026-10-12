import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import { Feature } from '@/modules/features/entities/feature.entity';
import { Plan } from '@/modules/features/entities/plan.entity';
import { TenantFeature } from '@/modules/features/entities/tenant-feature.entity';
import { AdminFeaturesController } from '@/modules/features/features.controller';
import { FeaturesGuard } from '@/modules/features/features.guard';
import { FeaturesModule } from '@/modules/features/features.module';
import { FeaturesService } from '@/modules/features/features.service';
import { MasterAdminService } from '@/modules/master-admin/master-admin.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  BalanceReminderJobController,
  BalanceRemindersController,
} from './balance-reminders.controller';
import { BalanceRemindersModule } from './balance-reminders.module';
import { BalanceRemindersService } from './balance-reminders.service';

// Replace infrastructure only: keep both modules, their services and all guards real.
// FeaturesService must not be global or mocked, which would hide the missing import.
const infrastructureProviders = [
  DataSource,
  ConfigService,
  ApiKeysService,
  MasterAdminService,
  NotificationsService,
].map((provide) => ({ provide, useValue: {} }));

@Global()
@Module({
  providers: infrastructureProviders,
  exports: infrastructureProviders.map(({ provide }) => provide),
})
class TestInfrastructureModule {}

describe('Balance reminders / features module startup', () => {
  it.each([BalanceRemindersModule, FeaturesModule])(
    'initializes the circular module graph from %p',
    async (entryModule) => {
      const builder = Test.createTestingModule({
        imports: [TestInfrastructureModule, entryModule],
      });
      for (const entity of [Feature, TenantFeature, Plan]) {
        builder.overrideProvider(getRepositoryToken(entity)).useValue({});
      }

      const module = await builder.compile();
      try {
        await module.init();

        const reminders = module.select(BalanceRemindersModule);
        const features = module.select(FeaturesModule);
        expect(reminders.get(FeaturesGuard, { strict: true })).toBeInstanceOf(FeaturesGuard);
        expect(reminders.get(BalanceRemindersService, { strict: true })).toBeInstanceOf(
          BalanceRemindersService
        );
        expect(reminders.get(BalanceRemindersController, { strict: true })).toBeInstanceOf(
          BalanceRemindersController
        );
        expect(reminders.get(BalanceReminderJobController, { strict: true })).toBeInstanceOf(
          BalanceReminderJobController
        );
        expect(features.get(FeaturesService, { strict: true })).toBeInstanceOf(FeaturesService);
        expect(features.get(AdminFeaturesController, { strict: true })).toBeInstanceOf(
          AdminFeaturesController
        );
      } finally {
        await module.close();
      }
    }
  );
});
