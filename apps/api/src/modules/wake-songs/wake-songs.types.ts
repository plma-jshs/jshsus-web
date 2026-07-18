export const WAKE_SONG_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PLAYED',
  'CANCELED',
] as const;

export type WakeSongRequestStatus = (typeof WAKE_SONG_STATUSES)[number];

export type WakeSongRequestSummary = {
  id: number;
  requesterId: number;
  requesterStudentNo: number;
  requesterName: string;
  requesterGrade?: number;
  requesterClassNo?: number;
  requesterNumber?: number;
  youtubeVideoId: string;
  canonicalUrl: string;
  embedUrl: string;
  videoTitle: string;
  channelTitle?: string;
  videoDurationSeconds?: number;
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  effectiveDurationSeconds: number;
  requestNote: string;
  status: WakeSongRequestStatus;
  reviewedById?: number;
  reviewedAt?: string;
  rejectionReason?: string;
  scheduledAt?: string;
  playedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WakeSongPage = {
  items: WakeSongRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
