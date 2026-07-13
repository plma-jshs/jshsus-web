import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { env } from '../../shared/config/env';
import { FilesService } from './files.service';

@Injectable()
export class FileCleanupWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FileCleanupWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly filesService: FilesService) {}

  onApplicationBootstrap(): void {
    // A startup pass recovers work left by a previous process. The interval is
    // unref'd so it never prevents a clean Node shutdown.
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), env.FILE_CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.filesService.processCleanupBatch();
      if (result.claimed > 0) {
        this.logger.log(
          `file cleanup batch claimed=${result.claimed} succeeded=${result.succeeded} failed=${result.failed}`,
        );
      }
    } catch (error) {
      // Cleanup availability must not take down the API. The next interval or a
      // second API instance will retry jobs whose lease is free or stale.
      this.logger.error(
        `file cleanup batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
