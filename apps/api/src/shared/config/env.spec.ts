import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

describe('file storage quota environment validation', () => {
  it('uses bounded account quotas by default', () => {
    const parsed = envSchema.safeParse({ NODE_ENV: 'test' });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.FILE_USER_STORAGE_QUOTA_MB).toBe(1_024);
      expect(parsed.data.FILE_MANAGER_STORAGE_QUOTA_MB).toBe(1_024);
    }
  });

  it('rejects quotas that cannot accommodate one accepted upload', () => {
    const parsed = envSchema.safeParse({
      NODE_ENV: 'test',
      FILE_UPLOAD_MAX_MB: '10',
      FILE_USER_STORAGE_QUOTA_MB: '5',
      FILE_MANAGER_STORAGE_QUOTA_MB: '100',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.FILE_USER_STORAGE_QUOTA_MB).toBeDefined();
    }
  });

  it('rejects a manager quota smaller than the member quota', () => {
    const parsed = envSchema.safeParse({
      NODE_ENV: 'test',
      FILE_USER_STORAGE_QUOTA_MB: '100',
      FILE_MANAGER_STORAGE_QUOTA_MB: '50',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.FILE_MANAGER_STORAGE_QUOTA_MB).toBeDefined();
    }
  });
});
