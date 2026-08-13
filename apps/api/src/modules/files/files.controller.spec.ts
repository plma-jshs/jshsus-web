import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { FilesController } from './files.controller';
import type { FilesService } from './files.service';
import type { AuthService } from '../auth/auth.service';

describe('FilesController protected object redirects', () => {
  it.each([
    ['content', 'inline'],
    ['download', 'attachment'],
  ] as const)('authorizes and redirects %s through a presigned URL', async (route, disposition) => {
    const filesService = {
      getAccessibleById: vi.fn().mockResolvedValue({ id: 12 }),
      getPresignedObjectUrl: vi.fn().mockResolvedValue('https://s3.example.test/signed-object'),
    } as unknown as FilesService;
    const authService = {
      getSessionFromRequest: vi.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const controller = new FilesController(filesService, authService);
    const response = {
      setHeader: vi.fn(),
      redirect: vi.fn(),
    } as unknown as Response;

    if (route === 'content') {
      await controller.content('12', {} as Request, response);
    } else {
      await controller.download('12', {} as Request, response);
    }

    expect(filesService.getAccessibleById).toHaveBeenCalledWith(12, null);
    expect(filesService.getPresignedObjectUrl).toHaveBeenCalledWith(12, disposition);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://s3.example.test/signed-object');
  });

  it('keeps profile images on the existing API stream path', async () => {
    const filesService = {
      getAccessibleById: vi.fn().mockResolvedValue({ id: 12, targetType: 'profile' }),
      getStoredObject: vi.fn().mockResolvedValue({
        bytes: Buffer.from('image'),
        mimeType: 'image/png',
        originalName: 'profile.png',
      }),
      getPresignedObjectUrl: vi.fn(),
    } as unknown as FilesService;
    const authService = {
      getSessionFromRequest: vi.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const controller = new FilesController(filesService, authService);
    const response = {
      type: vi.fn(),
      attachment: vi.fn(),
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as Response;

    await controller.download('12', {} as Request, response);

    expect(filesService.getStoredObject).toHaveBeenCalledWith(12);
    expect(filesService.getPresignedObjectUrl).not.toHaveBeenCalled();
    expect(response.attachment).toHaveBeenCalledWith('profile.png');
    expect(response.send).toHaveBeenCalledWith(Buffer.from('image'));
  });
});
