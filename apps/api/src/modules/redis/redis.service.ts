import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { env } from '../../shared/config/env';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;

  async onModuleInit() {
    this.client = createClient({
      url: env.REDIS_URL,
    });

    this.client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });

    try {
      await this.client.connect();
      this.logger.log('Redis connected');
    } catch (error) {
      if (env.NODE_ENV === 'production') {
        throw error;
      }

      this.logger.warn(
        `Redis unavailable, continuing without token store: ${(error as Error).message}`,
      );
      this.client = null;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    return this.client.get(key);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  }

  async claimWithinBudget(options: {
    dedupeKey: string;
    dedupeTtlSeconds: number;
    budgetKey: string;
    budgetTtlSeconds: number;
    maxClaims: number;
  }): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const result = await this.client.eval(
      `
        if redis.call('EXISTS', KEYS[1]) == 1 then
          return 0
        end
        local count = tonumber(redis.call('GET', KEYS[2]) or '0')
        if count >= tonumber(ARGV[3]) then
          return 0
        end
        redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
        count = redis.call('INCR', KEYS[2])
        if count == 1 then
          redis.call('EXPIRE', KEYS[2], ARGV[2])
        end
        return 1
      `,
      {
        keys: [options.dedupeKey, options.budgetKey],
        arguments: [
          String(options.dedupeTtlSeconds),
          String(options.budgetTtlSeconds),
          String(options.maxClaims),
        ],
      },
    );
    return Number(result) === 1;
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.del(key);
  }

  async take(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    return this.client.getDel(key);
  }

  /**
   * Reads and deletes a value only when it is still the value observed by the
   * caller. This is used for one-time handoffs where validation must happen
   * before consumption without allowing two concurrent consumers to win.
   */
  async takeIfValue(key: string, expectedValue: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const result = await this.client.eval(
      `
        local current = redis.call('GET', KEYS[1])
        if current == ARGV[1] then
          redis.call('DEL', KEYS[1])
          return current
        end
        return nil
      `,
      {
        keys: [key],
        arguments: [expectedValue],
      },
    );

    return typeof result === 'string' ? result : null;
  }

  async addToSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.sAdd(key, value);
    await this.client.expire(key, ttlSeconds);
  }

  async setMembers(key: string): Promise<string[]> {
    if (!this.client) return [];
    return this.client.sMembers(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    await this.client.del(keys);
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client) {
      return 1;
    }

    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }

    return count;
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis is unavailable.');
    }
    await this.client.ping();
  }

  async onApplicationShutdown() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
