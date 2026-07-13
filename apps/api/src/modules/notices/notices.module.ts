import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [NoticesController],
  providers: [NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
