import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from './redis.service';
import { ViewCountService } from './view-count.service';

describe('ViewCountService', () => {
  it('claims one bounded write window through an atomic Redis key', async () => {
    const redis = {
      claimWithinBudget: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    } as unknown as RedisService;
    const service = new ViewCountService(redis);

    await expect(service.claimIncrement('post', 41, 'user:12')).resolves.toBe(true);
    await expect(service.claimIncrement('post', 41, 'user:12')).resolves.toBe(false);
    expect(redis.claimWithinBudget).toHaveBeenNthCalledWith(1, {
      dedupeKey: expect.stringMatching(/^view-count:write:post:41:[a-f0-9]{32}$/),
      dedupeTtlSeconds: 1800,
      budgetKey: expect.stringMatching(/^view-count:write:budget:\d+$/),
      budgetTtlSeconds: 60,
      maxClaims: 300,
    });
  });

  it('keeps legitimate viewers in separate deduplication windows', async () => {
    const redis = {
      claimWithinBudget: vi.fn().mockResolvedValue(true),
    } as unknown as RedisService;
    const service = new ViewCountService(redis);

    await service.claimIncrement('post', 41, 'user:12');
    await service.claimIncrement('post', 41, 'user:13');

    const firstKey = vi.mocked(redis.claimWithinBudget).mock.calls[0]?.[0].dedupeKey;
    const secondKey = vi.mocked(redis.claimWithinBudget).mock.calls[1]?.[0].dedupeKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it('does not use client IP as an anonymous view-count restriction key', async () => {
    const redis = {
      claimWithinBudget: vi.fn().mockResolvedValue(false),
    } as unknown as RedisService;
    const service = new ViewCountService(redis);

    await expect(service.claimIncrement('post', 41, 'anonymous')).resolves.toBe(true);
    expect(redis.claimWithinBudget).not.toHaveBeenCalled();
  });

  it('fails closed for counter writes without failing the content read when Redis errors', async () => {
    const redis = {
      claimWithinBudget: vi.fn().mockRejectedValue(new Error('connection lost')),
    } as unknown as RedisService;
    const service = new ViewCountService(redis);

    await expect(service.claimIncrement('notice', 7, 'user:12')).resolves.toBe(false);
  });
});
