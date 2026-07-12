import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../../modules/redis/redis.service';
import { env } from '../config/env';

const limitedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const RATE_LIMIT_KEY = 'security:rate-limit';

export type RateLimitOptions = Readonly<{
  max: number;
  windowSeconds: number;
}>;

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

function normalizeIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const override = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!override && !limitedMethods.has(request.method)) {
      return true;
    }

    const path = request.originalUrl?.split('?', 1)[0] ?? request.path;
    const key = `rate:${normalizeIp(request)}:${request.method}:${path}`;
    const windowSeconds = override?.windowSeconds ?? env.RATE_LIMIT_WINDOW_SECONDS;
    const max = override?.max ?? env.RATE_LIMIT_MAX;
    const count = await this.redis.incrementWithTtl(key, windowSeconds);

    if (count > max) {
      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
