import { Module } from '@nestjs/common';
import { ActivityRequestsModule } from '../activity-requests/activity-requests.module';
import { DeviceCasesModule } from '../device-cases/device-cases.module';
import { PointsModule } from '../points/points.module';
import { SchoolDataModule } from '../school-data/school-data.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PointsModule, DeviceCasesModule, ActivityRequestsModule, SchoolDataModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
