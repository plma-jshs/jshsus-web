import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FileCleanupWorker } from './file-cleanup.worker';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FilesController],
  providers: [FilesService, FileCleanupWorker],
  exports: [FilesService],
})
export class FilesModule {}
