export const WAKE_SONG_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PLAYED',
  'CANCELED',
] as const;

export type WakeSongRequestStatus = (typeof WAKE_SONG_STATUSES)[number];

export type WakeSongAudioAsset = {
  status: 'READY';
  fileId: number;
  downloadUrl: string;
  sizeBytes: number;
  generatedAt: string;
};

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
  candidateWeekStart: string;
  candidateWeekEnd: string;
  candidateWeekLabel: string;
  createdAt: string;
  updatedAt: string;
  audio?: WakeSongAudioAsset;
};

export type WakeSongPage = {
  items: WakeSongRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
