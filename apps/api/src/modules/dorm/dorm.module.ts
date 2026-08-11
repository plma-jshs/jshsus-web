import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { DormController } from './dorm.controller';
import { StudentDormController } from './student-dorm.controller';
import { DormService } from './dorm.service';

@Module({
  imports: [FilesModule],
  controllers: [DormController, StudentDormController],
  providers: [DormService],
  exports: [DormService],
})
export class DormModule {}
