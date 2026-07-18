import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { env } from '../../shared/config/env';
import { FilesService } from './files.service';
import { AuthService } from '../auth/auth.service';

const memberRoles = [
  'student',
  'student_council',
  'teacher',
  'student_affairs_head',
  'system_admin',
] as const;

@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: env.FILE_UPLOAD_MAX_MB * 1024 * 1024 } }),
  )
  @RequireRoles(...memberRoles)
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { visibility?: string; targetType?: string; targetId?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.filesService.upload(
      {
        originalName: file?.originalname ?? '',
        mimeType: file?.mimetype ?? '',
        bytes: file?.buffer ?? Buffer.alloc(0),
        visibility: body.visibility,
        targetType: body.targetType,
        targetId: body.targetId,
      },
      request.authSession,
    );
  }

  @Post('profile')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: env.FILE_UPLOAD_MAX_MB * 1024 * 1024 } }),
  )
  @RequireRoles(...memberRoles)
  uploadProfile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.filesService.uploadProfile(
      {
        originalName: file?.originalname ?? '',
        mimeType: file?.mimetype ?? '',
        bytes: file?.buffer ?? Buffer.alloc(0),
      },
      request.authSession,
    );
  }

  @Delete('profile')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  deleteProfile(@Req() request: AuthenticatedRequest) {
    return this.filesService.deleteProfile(request.authSession);
  }

  @Get(':id')
  async metadata(@Param('id') id: string, @Req() request: Request) {
    const session = await this.authService.getSessionFromRequest(request);
    return this.filesService.getAccessibleById(Number(id), session);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    const numericId = Number(id);
    const session = await this.authService.getSessionFromRequest(request);
    await this.filesService.getAccessibleById(numericId, session);

    const stored = await this.filesService.getStoredObject(numericId);
    response.type(stored.mimeType);
    response.attachment(stored.originalName);

    if (stored.path) {
      response.sendFile(stored.path);
      return;
    }

    response.send(stored.bytes);
  }

  @Get(':id/content')
  async content(@Param('id') id: string, @Req() request: Request, @Res() response: Response) {
    const numericId = Number(id);
    const session = await this.authService.getSessionFromRequest(request);
    await this.filesService.getAccessibleById(numericId, session);

    const stored = await this.filesService.getStoredObject(numericId);
    response.type(stored.mimeType);
    response.setHeader('Content-Disposition', 'inline');

    if (stored.path) {
      response.sendFile(stored.path);
      return;
    }

    response.send(stored.bytes);
  }
}
