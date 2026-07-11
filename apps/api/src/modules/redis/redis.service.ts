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

  async delete(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.del(key);
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
