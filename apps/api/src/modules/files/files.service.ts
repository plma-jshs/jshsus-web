import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as schema from '@jshsus/db';
import type { UploadedFileSummary } from '@jshsus/types';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../shared/config/env';
import { type AppDatabase, DatabaseService } from '../database/database.service';
import type { AuthSession } from '../auth/auth.service';

export type FileCleanupReason =
  'upload_compensation' | 'target_delete' | 'notice_delete' | 'draft_delete' | 'lost_item_discard';

type CleanupTarget = {
  targetType: string;
  targetId: number;
};

type CleanupJob = {
  id: number;
  fileId: number | null;
  objectKey: string;
  targetType: string | null;
  targetId: number | null;
  reason: string;
  attempts: number;
};

type CleanupEnqueueInput = {
  fileId?: number | null;
  objectKey: string;
  targetType?: string | null;
  targetId?: number | null;
  reason: FileCleanupReason;
};

export type CleanupBatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
};

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

function hasTrustedFileSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return true;
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
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    // Keep every client-facing URL behind the API. Redirecting public objects to a
    // bucket URL would permanently disclose a bypass that cannot be revoked when
    // the parent post or lost-item entry is hidden later.
    url: `/api/files/${row.id}/download`,
    inlineUrl: `/api/files/${row.id}/content`,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly cleanupWorkerId = randomUUID();
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

    if (!hasTrustedFileSignature(parsed.data.mimeType, parsed.data.bytes)) {
      throw new BadRequestException('File contents do not match the declared image type.');
    }

    const actorId = session?.userId;
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to upload files.');
    }
    await this.assertCanAttach(
      parsed.data.targetType,
      parsed.data.targetId,
      session,
      parsed.data.visibility,
    );

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

    let result: { id: number };
    try {
      result = await this.database.db.transaction(async (transaction) => {
        // Serialize the final target check with parent deletion. If upload wins,
        // its file row is visible to the deletion transaction; if deletion wins,
        // this recheck fails and compensation cleanup owns the stored object.
        await this.assertCanAttach(
          parsed.data.targetType,
          parsed.data.targetId,
          session,
          parsed.data.visibility,
          transaction as unknown as AppDatabase,
          true,
        );
        const [inserted] = await transaction
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
        if (!inserted) {
          throw new Error('File metadata insert did not return an id.');
        }

        await transaction.insert(schema.auditLogs).values({
          actorId,
          action: 'file.upload',
          targetType: parsed.data.targetType,
          targetId: String(parsed.data.targetId),
        });
        return inserted;
      });
    } catch (error) {
      // A commit acknowledgement can be lost even though MySQL committed the
      // transaction. Never delete the object in this request: persist a
      // reconciliation job and let the worker first check whether the file row
      // exists. Queue errors are logged, while the original transaction error
      // remains caller-visible and the object remains recoverable.
      await this.queueUploadCompensation(
        {
          objectKey,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          reason: 'upload_compensation',
        },
        error,
      );
      throw error;
    }

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

  async assertInlineImagesForPost(
    postId: number,
    sources: string[],
    requirePublic: boolean,
  ): Promise<void> {
    if (sources.length === 0) return;

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
      .where(and(eq(schema.files.targetType, 'post'), eq(schema.files.targetId, postId)));

    const allowed = new Set<string>();
    for (const row of rows) {
      if (!row.mimeType.startsWith('image/') || (requirePublic && row.visibility !== 'public')) {
        continue;
      }
      const summary = toSummary(row);
      allowed.add(summary.inlineUrl);
    }
    if (sources.some((source) => !allowed.has(source))) {
      throw new BadRequestException(
        requirePublic
          ? 'Published posts may only embed public images uploaded to this post.'
          : 'Posts may only embed images uploaded to this post.',
      );
    }
  }

  async deleteForTarget(
    targetType: string,
    targetId: number,
  ): Promise<{ deleted: number; failed: number }> {
    const rows = await this.database.db
      .select({ id: schema.files.id })
      .from(schema.files)
      .where(and(eq(schema.files.targetType, targetType), eq(schema.files.targetId, targetId)));

    // Persist every object reference before touching external storage. Repeated
    // calls are harmless because object_key is unique in the outbox.
    await this.enqueueForTarget(targetType, targetId);
    await this.processCleanupBatch(Math.max(rows.length, 1), { targetType, targetId });

    const remaining = await this.database.db
      .select({ id: schema.files.id })
      .from(schema.files)
      .where(and(eq(schema.files.targetType, targetType), eq(schema.files.targetId, targetId)));
    return { deleted: rows.length - remaining.length, failed: remaining.length };
  }

  /**
   * Enqueue all files for a target. Passing the caller's transaction makes the
   * cleanup intent atomic with deletion of the parent row and its audit event.
   */
  async enqueueForTarget(
    targetType: string,
    targetId: number,
    reason: FileCleanupReason = 'target_delete',
    db: AppDatabase = this.database.db,
  ): Promise<number> {
    const rows = await db
      .select({ id: schema.files.id, objectKey: schema.files.objectKey })
      .from(schema.files)
      .where(and(eq(schema.files.targetType, targetType), eq(schema.files.targetId, targetId)));

    for (const row of rows) {
      await this.enqueueCleanup(
        {
          fileId: row.id,
          objectKey: row.objectKey,
          targetType,
          targetId,
          reason,
        },
        db,
      );
    }
    return rows.length;
  }

  async processCleanupBatch(
    limit = env.FILE_CLEANUP_BATCH_SIZE,
    target?: CleanupTarget,
  ): Promise<CleanupBatchResult> {
    const safeLimit = Math.max(1, Math.min(limit, env.FILE_CLEANUP_BATCH_SIZE));
    const jobs = await this.claimCleanupJobs(safeLimit, target);
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        if (job.reason === 'upload_compensation' && (await this.fileObjectExists(job.objectKey))) {
          // The upload transaction committed even though its acknowledgement was
          // lost. The file row is authoritative: preserve the object and only
          // consume the stale compensation intent.
          await this.deleteClaimedCleanupJob(job.id);
          succeeded += 1;
          continue;
        }

        // S3 DeleteObject and local ENOENT handling are idempotent. If the
        // following DB transaction fails, this job safely retries after lease
        // expiry and then removes its metadata.
        await this.deleteStoredObject(job.objectKey);
        await this.database.db.transaction(async (transaction) => {
          if (job.fileId !== null) {
            await transaction
              .delete(schema.files)
              .where(
                and(eq(schema.files.id, job.fileId), eq(schema.files.objectKey, job.objectKey)),
              );
          }
          await transaction
            .delete(schema.fileCleanupJobs)
            .where(
              and(
                eq(schema.fileCleanupJobs.id, job.id),
                eq(schema.fileCleanupJobs.lockedBy, this.cleanupWorkerId),
              ),
            );
        });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        await this.recordCleanupFailure(job, error);
      }
    }

    return { claimed: jobs.length, succeeded, failed };
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
    await this.assertTargetAccessible(file, session);

    if (file.visibility === 'private') {
      if (!session?.isLogined) {
        throw new UnauthorizedException('Login is required to access this file.');
      }
      const ownerId = await this.getAccessOwnerId(id);
      const canManage =
        session.roles?.includes('system_admin') || session.permissions?.includes('content.manage');
      if (!canManage && ownerId !== session.userId) {
        throw new ForbiddenException('You cannot access this private file.');
      }
    }

    return file;
  }

  async getAccessOwnerId(id: number): Promise<number | null> {
    const [row] = await this.database.db
      .select({ ownerId: schema.files.ownerId })
      .from(schema.files)
      .where(eq(schema.files.id, id))
      .limit(1);
    return row?.ownerId ?? null;
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

  private async enqueueCleanup(
    input: CleanupEnqueueInput,
    db: AppDatabase = this.database.db,
  ): Promise<void> {
    await db
      .insert(schema.fileCleanupJobs)
      .values({
        fileId: input.fileId ?? null,
        objectKey: input.objectKey,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason,
        nextAttemptAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          fileId: input.fileId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          updatedAt: new Date(),
        },
      });
  }

  private async claimCleanupJobs(limit: number, target?: CleanupTarget): Promise<CleanupJob[]> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - env.FILE_CLEANUP_LOCK_TIMEOUT_MS);

    return this.database.db.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          id: schema.fileCleanupJobs.id,
          fileId: schema.fileCleanupJobs.fileId,
          objectKey: schema.fileCleanupJobs.objectKey,
          targetType: schema.fileCleanupJobs.targetType,
          targetId: schema.fileCleanupJobs.targetId,
          reason: schema.fileCleanupJobs.reason,
          attempts: schema.fileCleanupJobs.attempts,
        })
        .from(schema.fileCleanupJobs)
        .where(
          and(
            lte(schema.fileCleanupJobs.nextAttemptAt, now),
            or(
              isNull(schema.fileCleanupJobs.lockedAt),
              lt(schema.fileCleanupJobs.lockedAt, staleBefore),
            ),
            target
              ? and(
                  eq(schema.fileCleanupJobs.targetType, target.targetType),
                  eq(schema.fileCleanupJobs.targetId, target.targetId),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.fileCleanupJobs.nextAttemptAt), asc(schema.fileCleanupJobs.id))
        .limit(limit)
        .for('update', { skipLocked: true });

      if (rows.length === 0) return [];

      await transaction
        .update(schema.fileCleanupJobs)
        .set({ lockedBy: this.cleanupWorkerId, lockedAt: now, updatedAt: now })
        .where(
          inArray(
            schema.fileCleanupJobs.id,
            rows.map((row) => row.id),
          ),
        );
      return rows;
    });
  }

  private async recordCleanupFailure(job: CleanupJob, error: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const delay = Math.min(
      env.FILE_CLEANUP_RETRY_BASE_MS * 2 ** Math.min(job.attempts, 10),
      env.FILE_CLEANUP_RETRY_MAX_MS,
    );
    const message = error instanceof Error ? error.message : String(error);

    try {
      await this.database.db
        .update(schema.fileCleanupJobs)
        .set({
          attempts,
          nextAttemptAt: new Date(Date.now() + delay),
          lastError: message.slice(0, 4000),
          lockedBy: null,
          lockedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.fileCleanupJobs.id, job.id),
            eq(schema.fileCleanupJobs.lockedBy, this.cleanupWorkerId),
          ),
        );
    } catch (updateError) {
      // Keep the lease in place if the retry update itself fails. Another worker
      // can reclaim it after FILE_CLEANUP_LOCK_TIMEOUT_MS.
      this.logger.error(
        `file cleanup retry state failed for ${job.objectKey}: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );
    }

    this.logger.warn(
      `file cleanup deferred for ${job.objectKey} (attempt ${attempts}): ${message}`,
    );
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

  private async deleteStoredObject(objectKey: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
      return;
    }

    try {
      await unlink(join(env.FILE_LOCAL_DIR, objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }

  private async fileObjectExists(objectKey: string): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: schema.files.id })
      .from(schema.files)
      .where(eq(schema.files.objectKey, objectKey))
      .limit(1);
    return Boolean(row);
  }

  private async deleteClaimedCleanupJob(jobId: number): Promise<void> {
    await this.database.db
      .delete(schema.fileCleanupJobs)
      .where(
        and(
          eq(schema.fileCleanupJobs.id, jobId),
          eq(schema.fileCleanupJobs.lockedBy, this.cleanupWorkerId),
        ),
      );
  }

  private async queueUploadCompensation(
    input: CleanupEnqueueInput,
    transactionError: unknown,
  ): Promise<void> {
    try {
      await this.enqueueCleanup(input);
    } catch (queueError) {
      // Do not attempt an eager delete when the outbox is unavailable. The
      // object may belong to a transaction whose commit acknowledgement was
      // lost; preserving it is the only non-destructive failure mode.
      const originalMessage =
        transactionError instanceof Error ? transactionError.message : String(transactionError);
      const queueMessage = queueError instanceof Error ? queueError.message : String(queueError);
      this.logger.error(
        `upload compensation enqueue failed for ${input.objectKey}; original transaction error: ${originalMessage}; enqueue error: ${queueMessage}; object preserved`,
      );
    }
  }

  private async assertTargetAccessible(
    file: UploadedFileSummary,
    session?: AuthSession | null,
  ): Promise<void> {
    if (!file.targetType || !file.targetId) return;

    const canManage =
      session?.roles?.includes('system_admin') || session?.permissions?.includes('content.manage');
    const canAccessStaff =
      canManage ||
      session?.roles?.includes('teacher') ||
      session?.roles?.includes('student_affairs_head');

    if (file.targetType === 'post') {
      const [target] = await this.database.db
        .select({
          authorId: schema.posts.authorId,
          status: schema.posts.status,
          isHidden: schema.posts.isHidden,
          boardVisibility: schema.boards.visibility,
        })
        .from(schema.posts)
        .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
        .where(eq(schema.posts.id, file.targetId))
        .limit(1);

      if (!target || (target.isHidden && !canManage)) {
        throw new NotFoundException('File was not found.');
      }
      if (target.status === 'draft') {
        if (!session?.isLogined || (!canManage && target.authorId !== session.userId)) {
          throw new NotFoundException('File was not found.');
        }
        return;
      }
      if (target.boardVisibility === 'public') return;
      if (target.boardVisibility === 'members' && session?.isLogined) return;
      if (target.boardVisibility === 'staff' && canAccessStaff) return;
      if (target.boardVisibility === 'admin' && canManage) return;
      throw new NotFoundException('File was not found.');
    }

    if (file.targetType === 'lost_item') {
      const [target] = await this.database.db
        .select({ status: schema.lostItems.status })
        .from(schema.lostItems)
        .where(eq(schema.lostItems.id, file.targetId))
        .limit(1);
      if (!target || (target.status === 'hidden' && !canManage)) {
        throw new NotFoundException('File was not found.');
      }
      return;
    }

    if (file.targetType === 'notice') {
      const [target] = await this.database.db
        .select({
          visibility: schema.notices.visibility,
          publishedAt: schema.notices.publishedAt,
        })
        .from(schema.notices)
        .where(eq(schema.notices.id, file.targetId))
        .limit(1);
      if (!target) throw new NotFoundException('File was not found.');
      if (!canManage && (!target.publishedAt || target.publishedAt > new Date())) {
        throw new NotFoundException('File was not found.');
      }
      if (target.visibility === 'public') return;
      if (target.visibility === 'members' && session?.isLogined) return;
      if (target.visibility === 'staff' && canAccessStaff) return;
      if (target.visibility === 'admin' && canManage) return;
      throw new NotFoundException('File was not found.');
    }
  }

  private async assertCanAttach(
    targetType: 'notice' | 'post' | 'lost_item',
    targetId: number,
    session: AuthSession,
    visibility: 'public' | 'private',
    db: AppDatabase = this.database.db,
    forUpdate = false,
  ) {
    const canManageContent =
      session.roles?.includes('system_admin') || session.permissions?.includes('content.manage');

    if (targetType === 'notice') {
      const query = db
        .select({ id: schema.notices.id })
        .from(schema.notices)
        .where(eq(schema.notices.id, targetId))
        .limit(1);
      const [target] = forUpdate ? await query.for('update') : await query;
      if (!target) throw new NotFoundException('Notice does not exist.');
      if (!canManageContent)
        throw new ForbiddenException('Only content managers can attach notice files.');
      return;
    }

    const query =
      targetType === 'post'
        ? db
            .select({ authorId: schema.posts.authorId, postStatus: schema.posts.status })
            .from(schema.posts)
            .where(eq(schema.posts.id, targetId))
            .limit(1)
        : db
            .select({ authorId: schema.lostItems.authorId })
            .from(schema.lostItems)
            .where(eq(schema.lostItems.id, targetId))
            .limit(1);
    const [target] = forUpdate ? await query.for('update') : await query;
    if (!target) throw new NotFoundException('Attachment target does not exist.');
    if (!canManageContent && target.authorId !== session.userId) {
      throw new ForbiddenException('You cannot attach files to this content.');
    }
    if (
      targetType === 'post' &&
      'postStatus' in target &&
      target.postStatus === 'draft' &&
      visibility !== 'private'
    ) {
      throw new BadRequestException('Draft post files must remain private until publication.');
    }
  }
}
