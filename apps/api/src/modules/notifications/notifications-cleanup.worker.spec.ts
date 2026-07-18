import { describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from './notifications.service';
import { NotificationsCleanupWorker } from './notifications-cleanup.worker';

describe('NotificationsCleanupWorker', () => {
  it('prevents overlapping cleanup passes', async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const deleteExpired = vi.fn(async () => pending);
    const worker = new NotificationsCleanupWorker({
      deleteExpired,
    } as unknown as NotificationsService);

    const first = worker.runOnce();
    const second = worker.runOnce();
    expect(deleteExpired).toHaveBeenCalledOnce();

    finish?.();
    await Promise.all([first, second]);
  });

  it('clears its unreferenced interval on shutdown', async () => {
    vi.useFakeTimers();
    try {
      const deleteExpired = vi.fn().mockResolvedValue(undefined);
      const worker = new NotificationsCleanupWorker({
        deleteExpired,
      } as unknown as NotificationsService);

      worker.onApplicationBootstrap();
      await Promise.resolve();
      expect(deleteExpired).toHaveBeenCalledOnce();

      worker.onApplicationShutdown();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
      expect(deleteExpired).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
