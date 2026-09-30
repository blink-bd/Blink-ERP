import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantBranding } from './entities/tenant-branding.entity';
import { BrandingService } from './branding.service';
import { BrandingController, AdminBrandingController } from './branding.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantBranding])],
  controllers: [BrandingController, AdminBrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
