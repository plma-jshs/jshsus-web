import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
