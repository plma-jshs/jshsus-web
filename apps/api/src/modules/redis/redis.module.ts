import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ViewCountService } from './view-count.service';

@Global()
@Module({
  providers: [RedisService, ViewCountService],
  exports: [RedisService, ViewCountService],
})
export class RedisModule {}
