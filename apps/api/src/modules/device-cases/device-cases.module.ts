import { Module } from '@nestjs/common';
import { DeviceCaseRemoteController, DeviceCasesController } from './device-cases.controller';
import { DeviceCaseScheduleWorker } from './device-case-schedule.worker';
import { DeviceCasesService } from './device-cases.service';

@Module({
  controllers: [DeviceCasesController, DeviceCaseRemoteController],
  providers: [DeviceCasesService, DeviceCaseScheduleWorker],
  exports: [DeviceCasesService],
})
export class DeviceCasesModule {}
