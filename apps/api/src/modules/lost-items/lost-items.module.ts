import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FilesModule } from '../files/files.module';
import { LostItemsController } from './lost-items.controller';
import { LostItemsService } from './lost-items.service';

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [LostItemsController],
  providers: [LostItemsService],
  exports: [LostItemsService],
})
export class LostItemsModule {}
