import {
  boolean,
  datetime,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { id, now, timestamps, visibilityEnum } from './common';
import { users } from './auth';

export const boards = mysqlTable(
  'boards',
  {
    id,
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    visibility: visibilityEnum.notNull().default('members'),
    allowAnonymous: boolean('allow_anonymous').notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    slugIdx: uniqueIndex('boards_slug_idx').on(table.slug),
  }),
);

export const notices = mysqlTable(
  'notices',
  {
    id,
    publicNo: int('public_no').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: longtext('content').notNull(),
    department: varchar('department', { length: 80 }),
    visibility: visibilityEnum.notNull().default('public'),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    authorId: int('author_id').references(() => users.id),
    viewCount: int('view_count').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    publishedIdx: index('notices_published_idx').on(table.publishedAt, table.pinned),
    publicNoIdx: uniqueIndex('notices_public_no_idx').on(table.publicNo),
  }),
);

export const postStatusEnum = mysqlEnum('post_status', ['draft', 'published']);

export const posts = mysqlTable(
  'posts',
  {
    id,
    publicNo: int('public_no').notNull(),
    boardId: int('board_id')
      .notNull()
      .references(() => boards.id),
    authorId: int('author_id').references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    content: longtext('content').notNull(),
    contentJson: json('content_json'),
    status: postStatusEnum.default('published'),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    isHidden: boolean('is_hidden').notNull().default(false),
    viewCount: int('view_count').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    boardCreatedIdx: index('posts_board_created_idx').on(table.boardId, table.createdAt),
    boardPublicNoIdx: uniqueIndex('posts_board_public_no_idx').on(table.boardId, table.publicNo),
    boardStatusCreatedIdx: index('posts_board_status_created_idx').on(
      table.boardId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const comments = mysqlTable(
  'comments',
  {
    id,
    postId: int('post_id')
      .notNull()
      .references(() => posts.id),
    parentId: int('parent_id'),
    authorId: int('author_id').references(() => users.id),
    content: text('content').notNull(),
    isHidden: boolean('is_hidden').notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    postIdx: index('comments_post_idx').on(table.postId, table.createdAt),
  }),
);

/**
 * Likes intentionally use concrete parent tables instead of the legacy
 * polymorphic reactions table. This lets MySQL enforce parent existence and
 * remove likes when either the content or account is deleted.
 */
export const postLikes = mysqlTable(
  'post_likes',
  {
    postId: int('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.userId] }),
    userIdx: index('post_likes_user_idx').on(table.userId),
  }),
);

export const postPollVotes = mysqlTable(
  'post_poll_votes',
  {
    postId: int('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    pollId: varchar('poll_id', { length: 80 }).notNull(),
    optionId: varchar('option_id', { length: 80 }).notNull(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.pollId, table.userId] }),
    optionIdx: index('post_poll_votes_option_idx').on(table.postId, table.pollId, table.optionId),
    userIdx: index('post_poll_votes_user_idx').on(table.userId),
  }),
);

export const commentLikes = mysqlTable(
  'comment_likes',
  {
    commentId: int('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.commentId, table.userId] }),
    userIdx: index('comment_likes_user_idx').on(table.userId),
  }),
);

export const reactionTargetEnum = mysqlEnum('reaction_target', ['post', 'comment', 'petition']);
export const reactionTypeEnum = mysqlEnum('reaction_type', ['like', 'upvote', 'downvote']);

export const reactions = mysqlTable(
  'reactions',
  {
    targetType: reactionTargetEnum.notNull(),
    targetId: int('target_id').notNull(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    type: reactionTypeEnum.notNull().default('like'),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.targetType, table.targetId, table.userId] }),
  }),
);

export const reportTargetEnum = mysqlEnum('report_target', ['post', 'comment', 'lost_item']);

export const reports = mysqlTable(
  'reports',
  {
    id,
    targetType: reportTargetEnum.notNull(),
    targetId: int('target_id').notNull(),
    reporterId: int('reporter_id').references(() => users.id),
    dedupeKey: varchar('dedupe_key', { length: 190 }),
    reason: varchar('reason', { length: 120 }).notNull(),
    detail: text('detail'),
    status: varchar('status', { length: 32 }).notNull().default('reviewing'),
    ...timestamps,
  },
  (table) => ({
    targetIdx: index('reports_target_idx').on(table.targetType, table.targetId),
    dedupeKeyIdx: uniqueIndex('reports_dedupe_key_idx').on(table.dedupeKey),
  }),
);

export const petitionStatusEnum = mysqlEnum('petition_status', [
  'open',
  'awaiting_answer',
  'answered',
  'expired',
  'hidden',
]);

export const petitions = mysqlTable(
  'petitions',
  {
    id,
    authorId: int('author_id').references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    content: longtext('content').notNull(),
    contentJson: json('content_json'),
    status: petitionStatusEnum.notNull().default('open'),
    startsAt: datetime('starts_at', { mode: 'date', fsp: 3 }).notNull(),
    endsAt: datetime('ends_at', { mode: 'date', fsp: 3 }).notNull(),
    participantCount: int('participant_count').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    statusEndsIdx: index('petitions_status_ends_idx').on(table.status, table.endsAt),
  }),
);

export const petitionParticipants = mysqlTable(
  'petition_participants',
  {
    petitionId: int('petition_id')
      .notNull()
      .references(() => petitions.id),
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.petitionId, table.userId] }),
  }),
);

export const petitionAnswers = mysqlTable('petition_answers', {
  id,
  petitionId: int('petition_id')
    .notNull()
    .references(() => petitions.id),
  authorId: int('author_id').references(() => users.id),
  content: longtext('content').notNull(),
  answeredAt: datetime('answered_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  ...timestamps,
});

export const thanksMessages = mysqlTable(
  'thanks_messages',
  {
    id,
    schoolNumber: varchar('school_number', { length: 20 }).notNull(),
    message: text('message').notNull(),
    submittedAt: datetime('submitted_at', { mode: 'date', fsp: 3 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    submittedIdx: index('thanks_messages_submitted_idx').on(table.submittedAt),
    studentIdx: index('thanks_messages_student_idx').on(table.schoolNumber, table.submittedAt),
  }),
);

export const lostItemTypeEnum = mysqlEnum('lost_item_type', ['lost', 'found']);
export const lostItemStatusEnum = mysqlEnum('lost_item_status', [
  'open',
  'matched',
  'closed',
  'hidden',
]);

export const lostItems = mysqlTable(
  'lost_items',
  {
    id,
    type: lostItemTypeEnum.notNull(),
    itemName: varchar('item_name', { length: 160 }).notNull(),
    location: varchar('location', { length: 160 }),
    occurredAt: datetime('occurred_at', { mode: 'date', fsp: 3 }),
    description: text('description'),
    status: lostItemStatusEnum.notNull().default('open'),
    authorId: int('author_id').references(() => users.id),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index('lost_items_status_idx').on(table.status, table.createdAt),
  }),
);
