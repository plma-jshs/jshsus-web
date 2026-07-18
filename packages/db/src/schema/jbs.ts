import { index, int, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { timestamps } from './common';
import { posts } from './content';

/**
 * YouTube-specific metadata for posts on the `jbs` board.
 *
 * The canonical post, author and comments deliberately stay in the existing
 * boards/posts/comments model. Keeping only the validated video identifier
 * here prevents arbitrary iframe markup or third-party embed URLs from being
 * persisted.
 */
export const jbsVideos = mysqlTable(
  'jbs_videos',
  {
    postId: int('post_id')
      .notNull()
      .references(() => posts.id),
    youtubeVideoId: varchar('youtube_video_id', { length: 11 }).notNull(),
    canonicalUrl: varchar('canonical_url', { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId] }),
    videoIdx: index('jbs_videos_video_idx').on(table.youtubeVideoId),
  }),
);
