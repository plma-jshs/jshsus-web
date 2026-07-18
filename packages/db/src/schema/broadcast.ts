import {
  datetime,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';
import { users } from './auth';
import { id, now, timestamps } from './common';

export const wakeSongRequestStatusEnum = mysqlEnum('wake_song_request_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PLAYED',
  'CANCELED',
]);

/**
 * A wake-song request stores a non-destructive YouTube playback segment.
 * playbackRateHundredths avoids floating-point values in persistence
 * (50 = 0.5x, 100 = 1x, 200 = 2x).
 */
export const wakeSongRequests = mysqlTable(
  'wake_song_requests',
  {
    id,
    requesterId: int('requester_id')
      .notNull()
      .references(() => users.id),
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }).notNull(),
    canonicalUrl: varchar('canonical_url', { length: 255 }).notNull(),
    videoTitle: varchar('video_title', { length: 255 }).notNull(),
    channelTitle: varchar('channel_title', { length: 255 }),
    videoDurationSeconds: int('video_duration_seconds'),
    startSeconds: int('start_seconds').notNull(),
    endSeconds: int('end_seconds').notNull(),
    playbackRateHundredths: int('playback_rate_hundredths').notNull().default(100),
    effectiveDurationSeconds: int('effective_duration_seconds').notNull(),
    requestNote: varchar('request_note', { length: 500 }).notNull().default(''),
    status: wakeSongRequestStatusEnum.notNull().default('PENDING'),
    reviewedById: int('reviewed_by_id').references(() => users.id),
    reviewedAt: datetime('reviewed_at', { mode: 'date', fsp: 3 }),
    rejectionReason: varchar('rejection_reason', { length: 500 }),
    scheduledAt: datetime('scheduled_at', { mode: 'date', fsp: 3 }),
    playedAt: datetime('played_at', { mode: 'date', fsp: 3 }),
    canceledAt: datetime('canceled_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    requesterStatusIdx: index('wake_song_requester_status_idx').on(table.requesterId, table.status),
    statusCreatedIdx: index('wake_song_status_created_idx').on(table.status, table.createdAt),
    scheduledIdx: index('wake_song_scheduled_idx').on(table.scheduledAt),
  }),
);

export const wakeSongRequestEventTypeEnum = mysqlEnum('wake_song_request_event_type', [
  'SUBMITTED',
  'UPDATED',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PLAYED',
  'CANCELED',
]);

export const wakeSongRequestEvents = mysqlTable(
  'wake_song_request_events',
  {
    id,
    wakeSongRequestId: int('wake_song_request_id').notNull(),
    actorId: int('actor_id').references(() => users.id),
    type: wakeSongRequestEventTypeEnum.notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    requestIdx: index('wake_song_events_request_idx').on(table.wakeSongRequestId, table.createdAt),
    requestFk: foreignKey({
      columns: [table.wakeSongRequestId],
      foreignColumns: [wakeSongRequests.id],
      name: 'wake_song_events_request_fk',
    }),
  }),
);
