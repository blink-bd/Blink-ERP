import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { UsersModule } from '@/modules/users/users.module';
import { FeaturesModule } from '@/modules/features/features.module';

/** Global: لأن JwtAuthGuard (المستخدم في كل الموديولات) بيحتاج ApiKeysService. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), UsersModule, FeaturesModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
