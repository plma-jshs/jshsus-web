import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as schema from '@jshsus/db';
import type { UploadedFileSummary } from '@jshsus/types';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../shared/config/env';
import { DatabaseService } from '../database/database.service';
import type { AuthSession } from '../auth/auth.service';

const uploadSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  bytes: z.instanceof(Buffer),
  visibility: z.enum(['public', 'private']).optional().default('private'),
  targetType: z.enum(['notice', 'post', 'lost_item']),
  targetId: z.coerce.number().int().positive(),
});

function isS3Enabled() {
  return Boolean(env.S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

function safeExtension(originalName: string) {
  const extension = extname(originalName).toLowerCase();
  return extension.length <= 12 ? extension : '';
}

function toSummary(row: {
  id: number;
  originalName: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: 'public' | 'private';
  targetType: string | null;
  targetId: number | null;
  uploadedAt: Date;
}): UploadedFileSummary {
  const encodedKey = row.objectKey.split('/').map(encodeURIComponent).join('/');
  const base = row.visibility === 'public' ? env.S3_PUBLIC_BASE_URL.replace(/\/$/, '') : '';

  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    url: base ? `${base}/${encodedKey}` : `/api/files/${row.id}/download`,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

@Injectable()
export class FilesService {
  private readonly s3 = isS3Enabled()
    ? new S3Client({
        region: env.AWS_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

  constructor(private readonly database: DatabaseService) {}

  async upload(
    body: unknown,
    session?: AuthSession | null,
  ): Promise<{ ok: true; file: UploadedFileSummary }> {
    const parsed = uploadSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    if (!env.FILE_ALLOWED_MIME_TYPES.includes(parsed.data.mimeType)) {
      throw new BadRequestException('Unsupported file type.');
    }

    const actorId = session?.userId;
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to upload files.');
    }
    await this.assertCanAttach(parsed.data.targetType, parsed.data.targetId, session);

    const bytes = parsed.data.bytes;
    const maxBytes = env.FILE_UPLOAD_MAX_MB * 1024 * 1024;

    if (bytes.length <= 0 || bytes.length > maxBytes) {
      throw new BadRequestException(
        `File must be between 1 byte and ${env.FILE_UPLOAD_MAX_MB} MB.`,
      );
    }

    const objectKey = [
      parsed.data.targetType ?? 'misc',
      new Date().toISOString().slice(0, 10),
      `${randomUUID()}${safeExtension(parsed.data.originalName)}`,
    ].join('/');

    await this.store(objectKey, bytes, parsed.data.mimeType);

    const [result] = await this.database.db
      .insert(schema.files)
      .values({
        ownerId: actorId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        originalName: parsed.data.originalName,
        objectKey,
        mimeType: parsed.data.mimeType,
        sizeBytes: bytes.length,
        visibility: parsed.data.visibility,
      })
      .$returningId();

    await this.database.writeAudit({
      actorId,
      action: 'file.upload',
      targetType: parsed.data.targetType ?? 'files',
      targetId: parsed.data.targetId ?? result.id,
    });

    const file = await this.getById(result.id);
    return { ok: true, file };
  }

  async listForTarget(
    targetType: string,
    targetId: number,
    includePrivate = false,
  ): Promise<UploadedFileSummary[]> {
    const files = await this.listForTargets(targetType, [targetId], includePrivate);
    return files.get(targetId) ?? [];
  }

  async listForTargets(
    targetType: string,
    targetIds: number[],
    includePrivate = false,
  ): Promise<Map<number, UploadedFileSummary[]>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const rows = await this.database.db
      .select({
        id: schema.files.id,
        originalName: schema.files.originalName,
        objectKey: schema.files.objectKey,
        mimeType: schema.files.mimeType,
        sizeBytes: schema.files.sizeBytes,
        visibility: schema.files.visibility,
        targetType: schema.files.targetType,
        targetId: schema.files.targetId,
        uploadedAt: schema.files.uploadedAt,
      })
      .from(schema.files)
      .where(
        and(
          eq(schema.files.targetType, targetType),
          inArray(schema.files.targetId, targetIds),
          includePrivate ? undefined : eq(schema.files.visibility, 'public'),
        ),
      );

    const byTarget = new Map<number, UploadedFileSummary[]>();
    for (const row of rows) {
      if (row.targetId === null) continue;
      const files = byTarget.get(row.targetId) ?? [];
      files.push(toSummary(row));
      byTarget.set(row.targetId, files);
    }
    return byTarget;
  }

  async getById(id: number): Promise<UploadedFileSummary> {
    const [row] = await this.database.db
      .select({
        id: schema.files.id,
        originalName: schema.files.originalName,
        objectKey: schema.files.objectKey,
        mimeType: schema.files.mimeType,
        sizeBytes: schema.files.sizeBytes,
        visibility: schema.files.visibility,
        targetType: schema.files.targetType,
        targetId: schema.files.targetId,
        uploadedAt: schema.files.uploadedAt,
      })
      .from(schema.files)
      .where(eq(schema.files.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException('File was not found.');
    }

    return toSummary(row);
  }

  async getAccessibleById(id: number, session?: AuthSession | null): Promise<UploadedFileSummary> {
    const file = await this.getById(id);

    if (file.visibility === 'private' && !session?.isLogined) {
      throw new UnauthorizedException('Login is required to access this file.');
    }

    return file;
  }

  async getStoredObject(
    id: number,
  ): Promise<{ bytes?: Buffer; path?: string; mimeType: string; originalName: string }> {
    const [row] = await this.database.db
      .select({
        objectKey: schema.files.objectKey,
        mimeType: schema.files.mimeType,
        originalName: schema.files.originalName,
      })
      .from(schema.files)
      .where(eq(schema.files.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException('File was not found.');
    }

    if (!this.s3) {
      return {
        path: join(env.FILE_LOCAL_DIR, row.objectKey),
        mimeType: row.mimeType,
        originalName: row.originalName,
      };
    }

    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: row.objectKey }),
    );
    const bytes = object.Body
      ? Buffer.from(await object.Body.transformToByteArray())
      : Buffer.alloc(0);

    return { bytes, mimeType: row.mimeType, originalName: row.originalName };
  }

  private async store(objectKey: string, bytes: Buffer, mimeType: string) {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: mimeType,
        }),
      );
      return;
    }

    const filePath = join(env.FILE_LOCAL_DIR, objectKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }

  private async assertCanAttach(
    targetType: 'notice' | 'post' | 'lost_item',
    targetId: number,
    session: AuthSession,
  ) {
    const canManageContent =
      session.roles?.includes('system_admin') || session.permissions?.includes('content.manage');

    if (targetType === 'notice') {
      const [target] = await this.database.db
        .select({ id: schema.notices.id })
        .from(schema.notices)
        .where(eq(schema.notices.id, targetId))
        .limit(1);
      if (!target) throw new NotFoundException('Notice does not exist.');
      if (!canManageContent)
        throw new ForbiddenException('Only content managers can attach notice files.');
      return;
    }

    const table = targetType === 'post' ? schema.posts : schema.lostItems;
    const [target] = await this.database.db
      .select({ authorId: table.authorId })
      .from(table)
      .where(eq(table.id, targetId))
      .limit(1);
    if (!target) throw new NotFoundException('Attachment target does not exist.');
    if (!canManageContent && target.authorId !== session.userId) {
      throw new ForbiddenException('You cannot attach files to this content.');
    }
  }
}
