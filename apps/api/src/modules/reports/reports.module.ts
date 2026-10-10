import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdvancedReportsService } from './advanced-reports.service';
import { ReportsController, AdvancedReportsController } from './reports.controller';
import { FeaturesModule } from '@/modules/features/features.module';

@Module({
  imports: [FeaturesModule],
  controllers: [AdvancedReportsController, ReportsController],
  providers: [ReportsService, AdvancedReportsService],
  exports: [ReportsService, AdvancedReportsService],
})
export class ReportsModule {}
