import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions, RequireRoles } from '../../shared/auth/auth.decorators';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { OptionalSessionGuard } from '../../shared/auth/optional-session.guard';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import { parseContentListQuery } from '../../shared/content-list-query';
import { BoardsService } from './boards.service';

const memberRoles = [
  'student',
  'student_council',
  'teacher',
  'student_affairs_head',
  'system_admin',
] as const;

@Controller()
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get('boards/:slug/posts')
  boardPosts(@Param('slug') slug: string, @Query() query: unknown) {
    return this.boardsService.listPostsPage(slug, parseContentListQuery(query));
  }

  @Get('boards/:slug/posts/:id')
  @UseGuards(OptionalSessionGuard)
  boardPost(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.getPost(slug, Number(id), request.authSession?.userId);
  }

  @Get('admin/boards/:slug/posts')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('community.manage')
  adminBoardPosts(@Param('slug') slug: string) {
    return this.boardsService.listPosts(slug, 100, true);
  }

  @Post('boards/:slug/posts')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createBoardPost(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.createMemberPost(slug, body, request.authSession?.userId);
  }

  @Post('boards/:slug/posts/drafts')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createBoardPostDraft(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.createMemberDraft(slug, body, request.authSession?.userId);
  }

  @Patch('boards/:slug/posts/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  updateBoardPost(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.updatePost(slug, Number(id), body, request.authSession);
  }

  @Post('boards/:slug/posts/:id/publish')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  publishBoardPost(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.publishPost(slug, Number(id), request.authSession);
  }

  @Delete('boards/:slug/posts/:id')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  deleteBoardPostDraft(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.deleteDraft(slug, Number(id), request.authSession);
  }

  @Get('boards/:slug/posts/:id/comments')
  @UseGuards(OptionalSessionGuard)
  boardComments(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.listComments(slug, Number(id), false, request.authSession?.userId);
  }

  @Get('admin/boards/:slug/posts/:id/comments')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('community.manage')
  adminBoardComments(@Param('slug') slug: string, @Param('id') id: string) {
    return this.boardsService.listComments(slug, Number(id), true);
  }

  @Post('boards/:slug/posts/:id/comments')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  createComment(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.createComment(slug, Number(id), body, request.authSession?.userId);
  }

  @Post('boards/:slug/posts/:id/like')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  togglePostLike(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.toggleFreePostLike(slug, Number(id), request.authSession?.userId);
  }

  @Post('boards/:slug/posts/:postId/comments/:commentId/like')
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard)
  @RequireRoles(...memberRoles)
  toggleCommentLike(
    @Param('slug') slug: string,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.toggleFreeCommentLike(
      slug,
      Number(postId),
      Number(commentId),
      request.authSession?.userId,
    );
  }

  @Put('admin/boards/posts/:id/hidden')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('community.manage')
  updatePostHidden(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.updatePostHidden(Number(id), body, request.authSession?.userId);
  }

  @Put('admin/boards/comments/:id/hidden')
  @UseGuards(SessionGuard, PermissionsGuard, CsrfGuard)
  @RequirePermissions('community.manage')
  updateCommentHidden(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.boardsService.updateCommentHidden(Number(id), body, request.authSession?.userId);
  }
}
