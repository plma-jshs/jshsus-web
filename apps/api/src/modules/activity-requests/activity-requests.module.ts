import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityRequestsController } from './activity-requests.controller';
import { ActivityRequestsService } from './activity-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ActivityRequestsController],
  providers: [ActivityRequestsService],
  exports: [ActivityRequestsService],
})
export class ActivityRequestsModule {}
