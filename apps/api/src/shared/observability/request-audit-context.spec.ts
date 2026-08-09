import { describe, expect, it } from 'vitest';
import { getRequestAuditContext, runWithRequestAuditContext } from './request-audit-context';

describe('request audit context', () => {
  it('keeps request metadata across asynchronous work', async () => {
    await new Promise<void>((resolve) => {
      runWithRequestAuditContext({ ipAddress: '127.0.0.1', userAgent: 'test-agent' }, async () => {
        await Promise.resolve();
        expect(getRequestAuditContext()).toEqual({
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        });
        resolve();
      });
    });
  });

  it('returns an empty context outside a request', () => {
    expect(getRequestAuditContext()).toEqual({});
  });
});
