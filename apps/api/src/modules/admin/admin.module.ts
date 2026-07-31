import { Module } from '@nestjs/common';
import { ActivityRequestsModule } from '../activity-requests/activity-requests.module';
import { DeviceCasesModule } from '../device-cases/device-cases.module';
import { FilesModule } from '../files/files.module';
import { PointsModule } from '../points/points.module';
import { SchoolDataModule } from '../school-data/school-data.module';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PointsModule, DeviceCasesModule, ActivityRequestsModule, SchoolDataModule, FilesModule],
  controllers: [AdminController],
  providers: [AdminService, AccountLifecycleService],
})
export class AdminModule {}
