import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { YouTubeModule } from '../youtube/youtube.module';
import { WakeSongsController } from './wake-songs.controller';
import { WakeSongAudioService } from './wake-song-audio.service';
import { WakeSongsService } from './wake-songs.service';

@Module({
  imports: [YouTubeModule, FilesModule],
  controllers: [WakeSongsController],
  providers: [WakeSongsService, WakeSongAudioService],
  exports: [WakeSongsService],
})
export class WakeSongsModule {}
