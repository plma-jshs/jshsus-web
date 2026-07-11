import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    try {
      await Promise.all([this.database.ping(), this.redis.ping()]);
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', service: 'jshsus-api' });
    }

    return {
      status: 'ok',
      service: 'jshsus-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live() {
    return { status: 'ok', service: 'jshsus-api', timestamp: new Date().toISOString() };
  }
}
