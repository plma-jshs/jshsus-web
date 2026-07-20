import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { OptionalSessionGuard } from '../../shared/auth/optional-session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { SessionGuard } from '../../shared/auth/session.guard';
import { RateLimit } from '../../shared/security/rate-limit.guard';
import { parseContentListQuery } from '../../shared/content-list-query';
import { JbsService } from './jbs.service';

@Controller('jbs')
export class JbsController {
  constructor(private readonly jbsService: JbsService) {}

  @Get('youtube/preview')
  @RateLimit({ max: 10, windowSeconds: 60 })
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('jbs.publish')
  preview(@Query('url') url: string) {
    return this.jbsService.preview(url);
  }

  @Get('posts')
  posts(@Query() query: unknown) {
    return this.jbsService.listPosts(parseContentListQuery(query));
  }

  @Get('posts/:id')
  @UseGuards(OptionalSessionGuard)
  post(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.jbsService.getPost(Number(id), request.authSession?.userId);
  }

  @Post('posts')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('jbs.publish')
  createPost(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.jbsService.createPost(body, request.authSession?.userId);
  }

  @Put('posts/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('jbs.publish')
  updatePost(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.jbsService.updatePost(Number(id), body, request.authSession);
  }

  @Delete('posts/:id')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('jbs.publish')
  deletePost(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.jbsService.deletePost(Number(id), request.authSession);
  }

  @Get('posts/:id/comments')
  @UseGuards(OptionalSessionGuard)
  comments(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.jbsService.listComments(Number(id), request.authSession?.userId);
  }

  @Post('posts/:id/comments')
  @UseGuards(SessionGuard, CsrfGuard)
  createComment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jbsService.createComment(Number(id), body, request.authSession?.userId);
  }

  @Post('posts/:id/like')
  @UseGuards(SessionGuard, CsrfGuard)
  togglePostLike(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.jbsService.togglePostLike(Number(id), request.authSession?.userId);
  }

  @Post('posts/:postId/comments/:commentId/like')
  @UseGuards(SessionGuard, CsrfGuard)
  toggleCommentLike(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jbsService.toggleCommentLike(
      Number(postId),
      Number(commentId),
      request.authSession?.userId,
    );
  }
}
