import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from '../../modules/redis/redis.service';
import { env } from '../config/env';

const limitedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!limitedMethods.has(request.method)) {
      return true;
    }

    const path = request.route?.path ?? request.path;
    const key = `rate:${normalizeIp(request)}:${request.method}:${path}`;
    const count = await this.redis.incrementWithTtl(key, env.RATE_LIMIT_WINDOW_SECONDS);

    if (count > env.RATE_LIMIT_MAX) {
      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
