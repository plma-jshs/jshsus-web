import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '../../shared/config/env';
import { FilesService } from '../files/files.service';
import type { WakeSongAudioAsset } from './wake-songs.types';

const execFileAsync = promisify(execFile);

export type WakeSongAudioInput = {
  id: number;
  requesterId: number;
  videoId: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  status: string;
};

export type GeneratedWakeSongAudio = {
  asset: WakeSongAudioAsset;
};

function atempoFilter(rate: number) {
  // The request policy currently allows 0.5x–2x. Keep this split into valid
  // ffmpeg atempo ranges so a future policy extension remains safe as well.
  const filters: string[] = [];
  let remaining = rate;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining *= 2;
  }
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  filters.push(`atempo=${remaining}`);
  return filters.join(',');
}

function safeFileName(title: string, id: number) {
  const value = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return `${value || `wake-song-${id}`}.mp3`;
}

@Injectable()
export class WakeSongAudioService {
  private readonly logger = new Logger(WakeSongAudioService.name);
  private readonly inFlight = new Map<number, Promise<GeneratedWakeSongAudio>>();

  constructor(private readonly files: FilesService) {}

  async generate(input: WakeSongAudioInput, actorId: number): Promise<GeneratedWakeSongAudio> {
    if (!['APPROVED', 'SCHEDULED', 'PLAYED'].includes(input.status)) {
      throw new BadRequestException('승인된 기상곡만 MP3로 변환할 수 있습니다.');
    }

    const existing = await this.files.listForTarget('wake_song', input.id, true);
    const existingAudio = existing.find((file) => file.mimeType === 'audio/mpeg');
    if (existingAudio) {
      return {
        asset: {
          status: 'READY',
          fileId: existingAudio.id,
          downloadUrl: existingAudio.url,
          sizeBytes: existingAudio.sizeBytes,
          generatedAt: existingAudio.uploadedAt,
        },
      };
    }

    const running = this.inFlight.get(input.id);
    if (running) return running;

    const task = this.generateFresh(input, actorId);
    this.inFlight.set(input.id, task);
    try {
      return await task;
    } finally {
      if (this.inFlight.get(input.id) === task) this.inFlight.delete(input.id);
    }
  }

  private async generateFresh(
    input: WakeSongAudioInput,
    actorId: number,
  ): Promise<GeneratedWakeSongAudio> {
    const duration = input.endSeconds - input.startSeconds;
    if (
      !Number.isInteger(input.startSeconds) ||
      !Number.isInteger(input.endSeconds) ||
      duration <= 0
    ) {
      throw new BadRequestException('기상곡 재생 구간이 올바르지 않습니다.');
    }
    if (!Number.isFinite(input.playbackRate) || input.playbackRate <= 0) {
      throw new BadRequestException('기상곡 재생 속도가 올바르지 않습니다.');
    }

    const workDir = await mkdtemp(join(tmpdir(), 'jshsus-wake-song-'));
    const outputPath = join(workDir, 'wake-song.mp3');
    const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(input.videoId)}`;

    try {
      const { stdout } = await execFileAsync(
        env.WAKE_SONG_YTDLP_BIN,
        [
          '--no-playlist',
          '--no-warnings',
          '--quiet',
          '--no-progress',
          '--format',
          'bestaudio/best',
          '--get-url',
          '--youtube-skip-dash-manifest',
          '--',
          sourceUrl,
        ],
        {
          timeout: env.WAKE_SONG_AUDIO_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
        },
      );
      const mediaUrl = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (!mediaUrl) throw new Error('yt-dlp did not return a media URL.');

      await execFileAsync(
        env.WAKE_SONG_FFMPEG_BIN,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          '-i',
          mediaUrl,
          '-ss',
          String(input.startSeconds),
          '-t',
          String(duration),
          '-vn',
          '-map_metadata',
          '-1',
          '-af',
          atempoFilter(input.playbackRate),
          '-c:a',
          'libmp3lame',
          '-b:a',
          '192k',
          '-ar',
          '44100',
          '-ac',
          '2',
          outputPath,
        ],
        {
          timeout: env.WAKE_SONG_AUDIO_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
        },
      );

      const outputStat = await stat(outputPath);
      if (outputStat.size <= 0 || outputStat.size > env.WAKE_SONG_AUDIO_MAX_BYTES) {
        throw new Error(`Generated MP3 size is invalid: ${outputStat.size} bytes.`);
      }
      const bytes = await readFile(outputPath);
      const stored = await this.files.storeGeneratedFile({
        actorId,
        ownerId: input.requesterId,
        targetType: 'wake_song',
        targetId: input.id,
        originalName: safeFileName(input.title, input.id),
        mimeType: 'audio/mpeg',
        bytes,
      });
      return {
        asset: {
          status: 'READY',
          fileId: stored.file.id,
          downloadUrl: stored.file.url,
          sizeBytes: stored.file.sizeBytes,
          generatedAt: stored.file.uploadedAt,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`wake-song ${input.id} MP3 conversion failed: ${message}`);
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        '기상곡 MP3를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
