export const wakeSongStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PLAYED',
  'CANCELED',
] as const;

export type WakeSongRequestStatus = (typeof wakeSongStatuses)[number];

export type WakeSongRequest = {
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
  createdAt: string;
};

export type WakeSongPage = {
  items: WakeSongRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
