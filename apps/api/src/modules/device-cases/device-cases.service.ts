import { Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  DeviceCase,
  DeviceCaseCommand,
  DeviceCaseCommandResult,
  DeviceCaseControlCommand,
} from '@jshsus/types';
import { desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';

const commandTargetState: Record<DeviceCaseControlCommand, boolean> = {
  open: true,
  close: false,
};

function commandResultMessage(command: DeviceCaseControlCommand) {
  return command === 'open' ? '관리자가 보관함을 열었습니다.' : '관리자가 보관함을 닫았습니다.';
}

function legacyCaseName(id: number) {
  return `${id}번 보관함`;
}

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

  async commandOne(
    deviceCaseId: number,
    actorId: number,
    command: DeviceCaseControlCommand,
  ): Promise<DeviceCaseCommandResult> {
    const targetIsOpen = commandTargetState[command];
    const now = new Date();

    return this.database.db.transaction(async (tx) => {
      const [deviceCase] = await tx
        .select({ id: schema.deviceCases.id })
        .from(schema.deviceCases)
        .where(eq(schema.deviceCases.id, deviceCaseId))
        .limit(1);

      if (!deviceCase) {
        throw new NotFoundException('Device case not found.');
      }

      await tx.insert(schema.deviceCaseCommands).values({
        actorId,
        command,
        completedAt: now,
        deviceCaseId,
        resultMessage: commandResultMessage(command),
        status: 'succeeded',
      });
      await tx
        .update(schema.deviceCases)
        .set({ isOpen: targetIsOpen, updatedAt: now })
        .where(eq(schema.deviceCases.id, deviceCaseId));
      await tx.insert(schema.auditLogs).values({
        actorId,
        action: `device_case.${command}`,
        targetId: String(deviceCaseId),
        targetType: 'device_cases',
      });

      return {
        ok: true,
        command,
        targetIsOpen,
        totalCases: 1,
        updatedCount: 1,
        excludedDisconnectedCount: 0,
      };
    });
  }

  async commandAll(
    actorId: number,
    command: DeviceCaseControlCommand,
  ): Promise<DeviceCaseCommandResult> {
    const targetIsOpen = commandTargetState[command];
    const now = new Date();

    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: schema.deviceCases.id,
          isConnected: schema.deviceCases.isConnected,
        })
        .from(schema.deviceCases)
        .orderBy(schema.deviceCases.id);
      if (rows.length > 0) {
        await tx.insert(schema.deviceCaseCommands).values(
          rows.map((deviceCase) => ({
            actorId,
            command,
            completedAt: now,
            deviceCaseId: deviceCase.id,
            resultMessage: commandResultMessage(command),
            status: 'succeeded' as const,
          })),
        );
        await tx
          .update(schema.deviceCases)
          .set({ isOpen: targetIsOpen, updatedAt: now })
          .where(
            inArray(
              schema.deviceCases.id,
              rows.map((deviceCase) => deviceCase.id),
            ),
          );
      }

      await tx.insert(schema.auditLogs).values({
        actorId,
        action: `device_case.bulk-${command}`,
        targetId: 'all-connected',
        targetType: 'device_cases',
      });

      return {
        ok: true,
        command,
        targetIsOpen,
        totalCases: rows.length,
        updatedCount: rows.length,
        excludedDisconnectedCount: 0,
      };
    });
  }

  async remoteCases() {
    return this.database.query('device-cases.remote-list', async (db) => {
      const rows = await db
        .select({
          id: schema.deviceCases.id,
          isOpen: schema.deviceCases.isOpen,
          lastSeenAt: schema.deviceCases.lastSeenAt,
        })
        .from(schema.deviceCases)
        .orderBy(schema.deviceCases.id);

      return rows.map((row) => ({
        id: row.id,
        name: legacyCaseName(row.id),
        status: row.isOpen ? 1 : 0,
        updatedAt: row.lastSeenAt.toISOString(),
        updatedBy: null,
      }));
    });
  }

  async markRemoteStatus(deviceCaseId?: number) {
    if (deviceCaseId !== undefined) {
      const now = new Date();
      await this.database.db
        .update(schema.deviceCases)
        .set({ isConnected: true, lastSeenAt: now, updatedAt: now })
        .where(eq(schema.deviceCases.id, deviceCaseId));
    }
    return { success: true };
  }

  async remoteCaseRequest(deviceCaseId: number) {
    const now = new Date();
    const [deviceCase] = await this.database.db
      .select({ id: schema.deviceCases.id, isOpen: schema.deviceCases.isOpen })
      .from(schema.deviceCases)
      .where(eq(schema.deviceCases.id, deviceCaseId))
      .limit(1);

    if (!deviceCase) {
      throw new NotFoundException('Case not found.');
    }

    await this.database.db
      .update(schema.deviceCases)
      .set({ isConnected: true, lastSeenAt: now, updatedAt: now })
      .where(eq(schema.deviceCases.id, deviceCaseId));

    return { success: deviceCase.isOpen };
  }
}
