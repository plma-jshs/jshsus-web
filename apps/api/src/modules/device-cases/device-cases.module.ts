import { Module } from '@nestjs/common';
import { DeviceCaseRemoteController, DeviceCasesController } from './device-cases.controller';
import { DeviceCasesService } from './device-cases.service';

@Module({
  controllers: [DeviceCasesController, DeviceCaseRemoteController],
  providers: [DeviceCasesService],
  exports: [DeviceCasesService],
})
export class DeviceCasesModule {}
