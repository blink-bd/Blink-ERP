import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { BranchAnalyticsService } from './branch-analytics.service';
import { FeaturesModule } from '@/modules/features/features.module';

@Module({
  imports: [FeaturesModule],
  controllers: [ReportsController],
  providers: [ReportsService, BranchAnalyticsService],
  exports: [ReportsService, BranchAnalyticsService],
})
export class ReportsModule {}
