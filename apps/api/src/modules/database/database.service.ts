import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as schema from '@jshsus/db';
import { readFileSync } from 'node:fs';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../../shared/config/env';

export type AppDatabase = MySql2Database<typeof schema>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: AppDatabase;

  constructor() {
    const ssl =
      env.DATABASE_SSL_MODE === 'disabled'
        ? undefined
        : env.DATABASE_SSL_MODE === 'required'
          ? { rejectUnauthorized: false }
          : {
              rejectUnauthorized: true,
              ca: readFileSync(env.DATABASE_SSL_CA_PATH, 'utf8'),
            };

    this.pool = mysql.createPool({
      uri: env.DATABASE_URL,
      ssl,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: '+09:00',
    });
    this.db = drizzle(this.pool, { schema, mode: 'default' });
  }

  async query<T>(label: string, operation: (db: AppDatabase) => Promise<T>): Promise<T> {
    try {
      return await operation(this.db);
    } catch (error) {
      this.logger.error(
        `${label} DB query failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async writeAudit(input: {
    actorId?: number | null;
    action: string;
    targetType?: string;
    targetId?: string | number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.db.insert(schema.auditLogs).values({
        actorId: input.actorId && input.actorId > 0 ? input.actorId : null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId === undefined ? undefined : String(input.targetId),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      this.logger.warn(`audit_logs insert failed: ${(error as Error).message}`);
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
