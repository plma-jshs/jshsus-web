import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsCleanupWorker } from './notifications-cleanup.worker';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCleanupWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
