import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ActivityRequestsModule } from './activity-requests/activity-requests.module';
import { AdminModule } from './admin/admin.module';
import { BoardsModule } from './boards/boards.module';
import { DatabaseModule } from './database/database.module';
import { DeviceCasesModule } from './device-cases/device-cases.module';
import { DormModule } from './dorm/dorm.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { JbsModule } from './jbs/jbs.module';
import { LostItemsModule } from './lost-items/lost-items.module';
import { MeModule } from './me/me.module';
import { NoticesModule } from './notices/notices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PetitionsModule } from './petitions/petitions.module';
import { PointsModule } from './points/points.module';
import { RedisModule } from './redis/redis.module';
import { ReportsModule } from './reports/reports.module';
import { ThanksModule } from './thanks/thanks.module';
import { WakeSongsModule } from './wake-songs/wake-songs.module';
import { RateLimitGuard } from '../shared/security/rate-limit.guard';

@Module({
  imports: [
    RedisModule,
    DatabaseModule,
    FilesModule,
    NoticesModule,
    NotificationsModule,
    BoardsModule,
    ReportsModule,
    LostItemsModule,
    AuthModule,
    HomeModule,
    JbsModule,
    MeModule,
    PointsModule,
    DeviceCasesModule,
    DormModule,
    ActivityRequestsModule,
    PetitionsModule,
    ThanksModule,
    WakeSongsModule,
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
