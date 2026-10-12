import { Module } from '@nestjs/common';
import { UsersModule } from '@/modules/users/users.module';
import { FeaturesModule } from '@/modules/features/features.module';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [UsersModule, FeaturesModule],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
