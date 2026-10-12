import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdvancedReportsService } from './advanced-reports.service';
import { ReportsController, AdvancedReportsController } from './reports.controller';
import { BranchAnalyticsService } from './branch-analytics.service';
import { FeaturesModule } from '@/modules/features/features.module';

@Module({
  imports: [FeaturesModule],
  controllers: [AdvancedReportsController, ReportsController],
  providers: [ReportsService, BranchAnalyticsService, AdvancedReportsService],
  exports: [ReportsService, BranchAnalyticsService, AdvancedReportsService],
})
export class ReportsModule {}
