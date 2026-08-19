import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DeviceCasesService } from './device-cases.service';

const SCHEDULE_INTERVAL_MS = 30_000;

@Injectable()
export class DeviceCaseScheduleWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceCaseScheduleWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly deviceCases: DeviceCasesService) {}

  onApplicationBootstrap() {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), SCHEDULE_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.deviceCases.runDueSchedules();
      if (result.executed) this.logger.log(`device case schedules executed=${result.executed}`);
    } catch (error) {
      this.logger.error(
        `device case schedule failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
