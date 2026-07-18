import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../shared/config/env';
import {
  parseIso8601Duration,
  parseYouTubeUrl,
  type YouTubeVideoReference,
} from './youtube-video.policy';

const youtubeResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({
        title: z.string().min(1),
        channelTitle: z.string().optional(),
      }),
      contentDetails: z.object({ duration: z.string().min(1) }),
      status: z.object({ embeddable: z.boolean(), uploadStatus: z.string().min(1) }),
    }),
  ),
});

export type YouTubeVideoMetadata = YouTubeVideoReference & {
  title: string;
  channelTitle?: string;
  durationSeconds: number;
};

@Injectable()
export class YouTubeDataApiService {
  private readonly apiKey = env.YOUTUBE_API_KEY;
  private readonly cache = new Map<string, { expiresAt: number; metadata: YouTubeVideoMetadata }>();
  private readonly inFlight = new Map<string, Promise<YouTubeVideoMetadata>>();

  async inspect(rawUrl: string): Promise<YouTubeVideoMetadata> {
    const reference = parseYouTubeUrl(rawUrl);
    if (!reference) {
      throw new BadRequestException('지원되는 HTTPS YouTube 영상 URL을 입력해 주세요.');
    }
    if (!this.apiKey) {
      throw new ServiceUnavailableException('YouTube Data API 키가 설정되지 않았습니다.');
    }

    const cached = this.cache.get(reference.videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.metadata;

    const pending = this.inFlight.get(reference.videoId);
    if (pending) return pending;

    const lookup = this.fetchMetadata(reference)
      .then((metadata) => {
        this.remember(metadata);
        return metadata;
      })
      .finally(() => this.inFlight.delete(reference.videoId));
    this.inFlight.set(reference.videoId, lookup);
    return lookup;
  }

  private async fetchMetadata(reference: YouTubeVideoReference): Promise<YouTubeVideoMetadata> {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      id: reference.videoId,
    });

    let response: Response;
    try {
      response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
        headers: { accept: 'application/json', 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new BadGatewayException('YouTube 영상 정보를 조회하지 못했습니다.');
    }

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new ServiceUnavailableException(
          'YouTube Data API를 사용할 수 없습니다. 키 제한 또는 할당량을 확인해 주세요.',
        );
      }
      throw new BadGatewayException('YouTube 영상 정보를 조회하지 못했습니다.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException('YouTube 영상 정보 응답을 읽지 못했습니다.');
    }

    const parsed = youtubeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadGatewayException('YouTube 영상 정보 응답 형식이 올바르지 않습니다.');
    }

    const video = parsed.data.items[0];
    if (!video) {
      throw new BadRequestException('존재하지 않거나 조회할 수 없는 YouTube 영상입니다.');
    }
    if (video.id !== reference.videoId) {
      throw new BadGatewayException('YouTube 영상 식별자가 요청과 일치하지 않습니다.');
    }
    if (!video.status.embeddable) {
      throw new BadRequestException('외부 재생이 허용되지 않은 YouTube 영상입니다.');
    }
    if (video.status.uploadStatus !== 'processed') {
      throw new BadRequestException('아직 재생할 수 없는 YouTube 영상입니다.');
    }

    const durationSeconds = parseIso8601Duration(video.contentDetails.duration);
    if (durationSeconds === undefined || durationSeconds <= 0) {
      throw new BadGatewayException('YouTube 영상 길이를 확인하지 못했습니다.');
    }

    return {
      ...reference,
      title: video.snippet.title,
      channelTitle: video.snippet.channelTitle,
      durationSeconds,
    };
  }

  private remember(metadata: YouTubeVideoMetadata) {
    if (this.cache.size >= 256 && !this.cache.has(metadata.videoId)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(metadata.videoId, {
      expiresAt: Date.now() + 6 * 60 * 60 * 1_000,
      metadata,
    });
  }
}
