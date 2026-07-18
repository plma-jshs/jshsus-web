export type WakeSongRequestStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'PLAYED' | 'CANCELED';

export type WakeSongPreview = {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  title: string;
  channelTitle?: string;
  durationSeconds: number;
};

export type WakeSongRequest = {
  id: number;
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
  rejectionReason?: string;
  scheduledAt?: string;
  playedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MyWakeSongRequests = {
  items: WakeSongRequest[];
  pendingCount: number;
  maxPending: number;
};

export type WakeSongRequestInput = {
  url: string;
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  requestNote: string;
};
