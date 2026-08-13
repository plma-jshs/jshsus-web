import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service';

const VIEW_COUNT_WRITE_WINDOW_SECONDS = 30 * 60;
const VIEW_COUNT_WRITE_BUDGET_WINDOW_SECONDS = 60;
const VIEW_COUNT_WRITE_BUDGET_MAX = 300;

type ViewCountTarget = 'notice' | 'post';

@Injectable()
export class ViewCountService {
  private readonly logger = new Logger(ViewCountService.name);
  private lastRedisWarningAt = 0;

  constructor(private readonly redis: RedisService) {}

  async claimIncrement(target: ViewCountTarget, id: number, viewerKey: string): Promise<boolean> {
    // Anonymous reads are intentionally not restricted by client IP. The
    // authenticated account key below still prevents repeated writes from
    // the same signed-in account within the deduplication window.
    if (viewerKey === 'anonymous') return true;

    try {
      const viewerHash = createHash('sha256').update(viewerKey).digest('hex').slice(0, 32);
      return await this.redis.claimWithinBudget({
        dedupeKey: `view-count:write:${target}:${id}:${viewerHash}`,
        dedupeTtlSeconds: VIEW_COUNT_WRITE_WINDOW_SECONDS,
        budgetKey: `view-count:write:budget:${Math.floor(Date.now() / 60_000)}`,
        budgetTtlSeconds: VIEW_COUNT_WRITE_BUDGET_WINDOW_SECONDS,
        maxClaims: VIEW_COUNT_WRITE_BUDGET_MAX,
      });
    } catch (error) {
      const now = Date.now();
      if (now - this.lastRedisWarningAt >= VIEW_COUNT_WRITE_WINDOW_SECONDS * 1000) {
        this.lastRedisWarningAt = now;
        this.logger.warn(
          `View count increment skipped because Redis is unavailable: ${(error as Error).message}`,
        );
      }
      return false;
    }
  }
}
