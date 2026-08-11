import { Module } from '@nestjs/common';
import { DormController } from './dorm.controller';
import { StudentDormController } from './student-dorm.controller';
import { DormService } from './dorm.service';

@Module({
  controllers: [DormController, StudentDormController],
  providers: [DormService],
  exports: [DormService],
})
export class DormModule {}
