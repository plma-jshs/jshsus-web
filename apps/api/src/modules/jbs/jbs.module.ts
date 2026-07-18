import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { DatabaseModule } from '../database/database.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { JbsController } from './jbs.controller';
import { JbsService } from './jbs.service';

@Module({
  imports: [DatabaseModule, BoardsModule, YouTubeModule],
  controllers: [JbsController],
  providers: [JbsService],
})
export class JbsModule {}
