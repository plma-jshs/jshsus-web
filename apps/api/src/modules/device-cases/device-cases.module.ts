import { Module } from '@nestjs/common';
import { DeviceCasesController } from './device-cases.controller';
import { DeviceCasesService } from './device-cases.service';

@Module({
  controllers: [DeviceCasesController],
  providers: [DeviceCasesService],
  exports: [DeviceCasesService],
})
export class DeviceCasesModule {}
