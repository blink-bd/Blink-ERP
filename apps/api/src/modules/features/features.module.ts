import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feature } from './entities/feature.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { Plan } from './entities/plan.entity';
import { FeaturesService } from './features.service';
import { FeaturesController, AdminFeaturesController } from './features.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Feature, TenantFeature, Plan])],
  controllers: [FeaturesController, AdminFeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
