import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ActivityRequestsModule } from './activity-requests/activity-requests.module';
import { AdminModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { ContentModule } from './content/content.module';
import { DeviceCasesModule } from './device-cases/device-cases.module';
import { DormModule } from './dorm/dorm.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { MeModule } from './me/me.module';
import { PetitionsModule } from './petitions/petitions.module';
import { PointsModule } from './points/points.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitGuard } from '../shared/security/rate-limit.guard';

@Module({
  imports: [
    RedisModule,
    DatabaseModule,
    ContentModule,
    FilesModule,
    AuthModule,
    HomeModule,
    MeModule,
    PointsModule,
    DeviceCasesModule,
    DormModule,
    ActivityRequestsModule,
    PetitionsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
