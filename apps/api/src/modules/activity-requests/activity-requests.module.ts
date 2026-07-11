import { Module } from '@nestjs/common';
import { ActivityRequestsController } from './activity-requests.controller';
import { ActivityRequestsService } from './activity-requests.service';

@Module({
  controllers: [ActivityRequestsController],
  providers: [ActivityRequestsService],
  exports: [ActivityRequestsService],
})
export class ActivityRequestsModule {}
