import { describe, expect, it, vi } from 'vitest';
import { FileCleanupWorker } from './file-cleanup.worker';
import type { FilesService } from './files.service';

describe('FileCleanupWorker', () => {
  it('prevents overlapping in-process batches', async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const processCleanupBatch = vi.fn(async () => {
      await pending;
      return { claimed: 0, succeeded: 0, failed: 0 };
    });
    const worker = new FileCleanupWorker({ processCleanupBatch } as unknown as FilesService);

    const first = worker.runOnce();
    const second = worker.runOnce();
    expect(processCleanupBatch).toHaveBeenCalledOnce();

    finish?.();
    await Promise.all([first, second]);
  });

  it('clears its interval during application shutdown', async () => {
    vi.useFakeTimers();
    try {
      const processCleanupBatch = vi
        .fn()
        .mockResolvedValue({ claimed: 0, succeeded: 0, failed: 0 });
      const worker = new FileCleanupWorker({ processCleanupBatch } as unknown as FilesService);

      worker.onApplicationBootstrap();
      await Promise.resolve();
      expect(processCleanupBatch).toHaveBeenCalledOnce();

      worker.onApplicationShutdown();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(processCleanupBatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
