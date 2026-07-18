import { Module } from '@nestjs/common';
import { YouTubeDataApiService } from './youtube-data-api.service';

@Module({
  providers: [YouTubeDataApiService],
  exports: [YouTubeDataApiService],
})
export class YouTubeModule {}
