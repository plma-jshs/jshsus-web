import type { UploadedFileSummary } from '@jshsus/types';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../auth/auth.service';
import type { DatabaseService } from '../database/database.service';
import { FilesService } from './files.service';

const privateFile: UploadedFileSummary = {
  id: 1,
  originalName: 'private.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  visibility: 'private',
  url: '/api/files/1/download',
  uploadedAt: new Date(0).toISOString(),
};

describe('FilesService access policy', () => {
  it('rejects anonymous access to private files', async () => {
    const service = new FilesService({} as DatabaseService);
    vi.spyOn(service, 'getById').mockResolvedValue(privateFile);

    await expect(service.getAccessibleById(1, null)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows an authenticated member to access private files', async () => {
    const service = new FilesService({} as DatabaseService);
    vi.spyOn(service, 'getById').mockResolvedValue(privateFile);
    const session: AuthSession = {
      isLogined: true,
      iamId: 1,
      userId: 1,
      plmaId: 0,
      roles: ['student'],
      permissions: [],
    };

    await expect(service.getAccessibleById(1, session)).resolves.toEqual(privateFile);
  });
});
