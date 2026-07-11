import { Module } from '@nestjs/common';
import { ActivityRequestsModule } from '../activity-requests/activity-requests.module';
import { DeviceCasesModule } from '../device-cases/device-cases.module';
import { DormModule } from '../dorm/dorm.module';
import { PetitionsModule } from '../petitions/petitions.module';
import { PointsModule } from '../points/points.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PointsModule, DeviceCasesModule, DormModule, ActivityRequestsModule, PetitionsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
