import { describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.service';

describe('RedisService view-count claims', () => {
  it('uses one atomic Redis script for deduplication and the global write budget', async () => {
    const evalScript = vi.fn().mockResolvedValue(1);
    const service = new RedisService();
    Object.assign(service as unknown as { client: unknown }, { client: { eval: evalScript } });

    await expect(
      service.claimWithinBudget({
        dedupeKey: 'view-count:write:post:41:viewer',
        dedupeTtlSeconds: 1800,
        budgetKey: 'view-count:write:budget',
        budgetTtlSeconds: 60,
        maxClaims: 300,
      }),
    ).resolves.toBe(true);
    expect(evalScript).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXISTS', KEYS[1])"),
      {
        keys: ['view-count:write:post:41:viewer', 'view-count:write:budget'],
        arguments: ['1800', '60', '300'],
      },
    );
  });

  it('fails closed when Redis is disconnected', async () => {
    const service = new RedisService();

    await expect(
      service.claimWithinBudget({
        dedupeKey: 'view-count:write:post:41:viewer',
        dedupeTtlSeconds: 1800,
        budgetKey: 'view-count:write:budget',
        budgetTtlSeconds: 60,
        maxClaims: 300,
      }),
    ).resolves.toBe(false);
  });
});

describe('RedisService one-time conditional consumption', () => {
  it('deletes only when the observed value is still current', async () => {
    const evalScript = vi.fn().mockResolvedValue('payload');
    const service = new RedisService();
    Object.assign(service as unknown as { client: unknown }, { client: { eval: evalScript } });

    await expect(service.takeIfValue('sso:code:hash', 'payload')).resolves.toBe('payload');
    expect(evalScript).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET', KEYS[1])"), {
      keys: ['sso:code:hash'],
      arguments: ['payload'],
    });
  });

  it('fails closed when Redis is disconnected', async () => {
    const service = new RedisService();
    await expect(service.takeIfValue('sso:code:hash', 'payload')).resolves.toBeNull();
  });
});
