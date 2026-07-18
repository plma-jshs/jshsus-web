import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

@Injectable()
export class NotificationsCleanupWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsCleanupWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly notificationsService: NotificationsService) {}

  onApplicationBootstrap(): void {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), CLEANUP_INTERVAL_MS);
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
      await this.notificationsService.deleteExpired();
    } catch (error) {
      this.logger.error(
        `notification cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
