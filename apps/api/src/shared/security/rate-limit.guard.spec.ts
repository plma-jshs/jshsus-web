import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../../modules/redis/redis.service';
import { SchoolDataController } from '../../modules/school-data/school-data.controller';
import { RATE_LIMIT_KEY, RateLimitGuard, type RateLimitOptions } from './rate-limit.guard';

function requestContext(method: string, originalUrl: string): ExecutionContext {
  const handler = () => undefined;
  class Controller {}
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        originalUrl,
        path: originalUrl,
        ip: '203.0.113.10',
        socket: {},
      }),
    }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
}

function createGuard(override: RateLimitOptions | undefined, count: number) {
  const redis = {
    incrementWithTtl: vi.fn().mockResolvedValue(count),
  } as unknown as RedisService;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(override),
  } as unknown as Reflector;
  return { guard: new RateLimitGuard(redis, reflector), redis };
}

describe('RateLimitGuard', () => {
  it('leaves ordinary public GET endpoints unchanged', async () => {
    const { guard, redis } = createGuard(undefined, 1);

    await expect(guard.canActivate(requestContext('GET', '/api/health'))).resolves.toBe(true);
    expect(redis.incrementWithTtl).not.toHaveBeenCalled();
  });

  it('enforces endpoint-specific limits on decorated public GET endpoints', async () => {
    const { guard, redis } = createGuard({ max: 2, windowSeconds: 30 }, 3);

    const rejection = guard.canActivate(
      requestContext('GET', '/api/school-data/calendar?from=2026-07-01'),
    );
    await expect(rejection).rejects.toBeInstanceOf(HttpException);
    await expect(rejection).rejects.toMatchObject({ status: 429 });
    expect(redis.incrementWithTtl).toHaveBeenCalledWith(
      'rate:203.0.113.10:GET:/api/school-data/calendar',
      30,
    );
  });

  it('keeps the school-data controller limit explicit and reviewable', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, SchoolDataController)).toEqual({
      max: 30,
      windowSeconds: 60,
    });
  });
});
