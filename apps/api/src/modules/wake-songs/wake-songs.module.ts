import { Module } from '@nestjs/common';
import { YouTubeModule } from '../youtube/youtube.module';
import { WakeSongsController } from './wake-songs.controller';
import { WakeSongsService } from './wake-songs.service';

@Module({
  imports: [YouTubeModule],
  controllers: [WakeSongsController],
  providers: [WakeSongsService],
  exports: [WakeSongsService],
})
export class WakeSongsModule {}
