import { Injectable } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { DeviceCase, DeviceCaseCommand } from '@jshsus/types';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DeviceCasesService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<DeviceCase[]> {
    return this.database.query('device-cases.list', async (db) => {
      const rows = await db
        .select({
          id: schema.deviceCases.id,
          isConnected: schema.deviceCases.isConnected,
          isOpen: schema.deviceCases.isOpen,
          lastSeenAt: schema.deviceCases.lastSeenAt,
        })
        .from(schema.deviceCases)
        .orderBy(schema.deviceCases.id);

      return rows.map((row) => ({ ...row, lastSeenAt: row.lastSeenAt.toISOString() }));
    });
  }

  async commands(deviceCaseId: number): Promise<DeviceCaseCommand[]> {
    return this.database.query('device-cases.commands', async (db) => {
      const rows = await db
        .select({
          id: schema.deviceCaseCommands.id,
          deviceCaseId: schema.deviceCaseCommands.deviceCaseId,
          actorName: schema.users.name,
          command: schema.deviceCaseCommands.command,
          status: schema.deviceCaseCommands.status,
          createdAt: schema.deviceCaseCommands.createdAt,
        })
        .from(schema.deviceCaseCommands)
        .innerJoin(schema.users, eq(schema.deviceCaseCommands.actorId, schema.users.id))
        .where(eq(schema.deviceCaseCommands.deviceCaseId, deviceCaseId))
        .orderBy(desc(schema.deviceCaseCommands.createdAt))
        .limit(100);

      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }
}
