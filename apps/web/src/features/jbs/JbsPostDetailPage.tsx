import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { BoardCommentSummary } from '@jshsus/types';
import { ArrowLeft, Eye, Flag, MessageCircle, Send } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { ContentDetailHeader } from '../../components/page/ContentDetailHeader';
import { ContentLikeButton } from '../../components/page/ContentLikeButton';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createContentReport } from '../../shared/api/reports';
import { formatKoreanRelativeTime } from '../../shared/lib/date';
import { authActionRequiresLogin } from '../auth/action-access';
import { getSession } from '../auth/api';
import {
  createJbsComment,
  getJbsComments,
  getJbsPost,
  type JbsPost,
  toggleJbsCommentLike,
  toggleJbsPostLike,
} from './api';

function reportTargetKey(targetType: 'post' | 'comment', targetId: number) {
  return `${targetType}:${targetId}`;
}
import './jbs.css';

export function JbsPostDetailPage() {
  const { postId } = useParams({ from: '/jbs/$postId' });
  const numericId = Number(postId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [comment, setComment] = useState('');
  const [reportedTargets, setReportedTargets] = useState<Set<string>>(() => new Set());
  const postQueryKey = ['jbs-post', numericId] as const;
  const commentsQueryKey = ['jbs-comments', numericId] as const;
  const postQuery = useQuery({
    queryKey: postQueryKey,
    queryFn: () => getJbsPost(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const commentsQuery = useQuery({
    queryKey: commentsQueryKey,
    queryFn: () => getJbsComments(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const commentMutation = useMutation({
    mutationFn: () => createJbsComment(numericId, comment.trim()),
    onSuccess: async () => {
      setComment('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jbs-comments', numericId] }),
        queryClient.invalidateQueries({ queryKey: ['jbs-post', numericId] }),
      ]);
    },
  });
  const reportMutation = useMutation({
    mutationFn: createContentReport,
    onSuccess: (_result, input) => {
      setReportedTargets((current) => {
        const next = new Set(current);
        next.add(reportTargetKey(input.targetType as 'post' | 'comment', input.targetId));
        return next;
      });
      showToast({ title: '신고를 접수했습니다.', tone: 'success' });
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.status === 409) {
        setReportedTargets((current) => {
          const next = new Set(current);
          next.add(reportTargetKey(input.targetType as 'post' | 'comment', input.targetId));
          return next;
        });
        showToast({ title: '이미 신고한 내용입니다.', tone: 'info' });
        return;
      }
      if (!authActionRequiresLogin(sessionQuery.data, error)) {
        showToast({ title: '신고를 접수하지 못했습니다.', tone: 'danger' });
      }
    },
  });
  const goToLogin = () => {
    void navigate({ to: '/login', search: { returnTo: `/jbs/${postId}` } });
  };
  const postLikeMutation = useMutation({
    mutationFn: () => toggleJbsPostLike(numericId),
    onSuccess: async (result) => {
      queryClient.setQueryData<JbsPost>(postQueryKey, (current) =>
        current ? { ...current, likedByMe: result.liked, likeCount: result.likeCount } : current,
      );
      await queryClient.invalidateQueries({ queryKey: postQueryKey });
    },
    onError: (error) => {
      if (authActionRequiresLogin(sessionQuery.data, error)) {
        goToLogin();
        return;
      }
      showToast({ title: '좋아요를 반영하지 못했습니다.', tone: 'danger' });
    },
  });
  const commentLikeMutation = useMutation({
    mutationFn: (commentId: number) => toggleJbsCommentLike(numericId, commentId),
    onSuccess: async (result, commentId) => {
      queryClient.setQueryData<BoardCommentSummary[]>(commentsQueryKey, (current) =>
        current?.map((item) =>
          item.id === commentId
            ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
            : item,
        ),
      );
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    onError: (error) => {
      if (authActionRequiresLogin(sessionQuery.data, error)) {
        goToLogin();
        return;
      }
      showToast({ title: '댓글 좋아요를 반영하지 못했습니다.', tone: 'danger' });
    },
  });
  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (comment.trim() && sessionQuery.data?.isLogined) commentMutation.mutate();
  };

  if (postQuery.isLoading) return <PageState kind="loading" title="영상을 불러오는 중입니다." />;
  if (postQuery.isError || !postQuery.data) {
    const status = postQuery.error instanceof ApiError ? postQuery.error.status : 0;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('jbs')}
        title={status === 404 ? '영상을 찾을 수 없습니다' : '영상을 불러오지 못했습니다'}
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            status === 404
              ? '삭제되었거나 존재하지 않는 영상입니다.'
              : '잠시 후 다시 시도해 주세요.'
          }
          action={
            <Link className="detail-secondary-button" to="/jbs">
              JBS로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  const post = postQuery.data;
  const reportNeedsLogin = authActionRequiresLogin(sessionQuery.data, reportMutation.error);
  return (
    <PageScaffold breadcrumbs={detailBreadcrumbs('jbs')} width="reading" variant="document">
      <article className="jbs-detail">
        <ContentDetailHeader
          title={post.title}
          author={post.authorName ?? '방송부'}
          createdAt={post.createdAt}
        >
          <span>
            <Eye size={14} aria-hidden="true" />
            <span className="sr-only">조회 </span>
            {post.viewCount}
          </span>
          <span>
            <MessageCircle size={14} aria-hidden="true" />
            <span className="sr-only">댓글 </span>
            {post.commentCount}
          </span>
        </ContentDetailHeader>
        <div className="jbs-player">
          <iframe
            src={post.embedUrl}
            title={`${post.title} YouTube 영상`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <p className="jbs-detail__description">{post.description}</p>
        <div className="post-detail-actions">
          <ContentLikeButton
            liked={post.likedByMe}
            likeCount={post.likeCount}
            disabled={sessionQuery.isLoading || postLikeMutation.isPending}
            onClick={() => (sessionQuery.data?.isLogined ? postLikeMutation.mutate() : goToLogin())}
          />
          {sessionQuery.isLoading ? (
            <button type="button" disabled>
              로그인 상태 확인 중
            </button>
          ) : reportNeedsLogin ? (
            <Link
              className="auth-required-action content-report-action"
              to="/login"
              search={{ returnTo: `/jbs/${postId}` }}
            >
              <Flag size={14} aria-hidden="true" /> 로그인하고 신고
            </Link>
          ) : (
            <button
              className="content-report-action"
              type="button"
              disabled={reportMutation.isPending}
              onClick={() =>
                reportMutation.mutate({
                  targetType: 'post',
                  targetId: post.id,
                  reason: '부적절한 JBS 게시글',
                })
              }
            >
              <Flag
                className={
                  reportedTargets.has(reportTargetKey('post', post.id)) ? 'is-filled' : undefined
                }
                size={14}
                aria-hidden="true"
              />
              신고
            </button>
          )}
        </div>
      </article>

      <section className="comment-surface" aria-labelledby="jbs-comments-title">
        <header>
          <h2 id="jbs-comments-title">
            댓글 <span>{commentsQuery.data?.length ?? 0}</span>
          </h2>
        </header>
        {commentsQuery.isLoading ? (
          <PageState kind="loading" variant="inline" title="댓글을 불러오는 중입니다." />
        ) : null}
        {commentsQuery.isError ? (
          <PageState
            kind="error"
            variant="inline"
            title="댓글을 불러오지 못했습니다."
            action={
              <button
                className="detail-text-button"
                type="button"
                onClick={() => commentsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {commentsQuery.data?.length ? (
          <div className="detail-comment-list">
            {commentsQuery.data.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.authorName ?? '작성자'}</strong>
                  <time dateTime={item.createdAt} title={item.createdAt}>
                    {formatKoreanRelativeTime(item.createdAt)}
                  </time>
                </div>
                <p>{item.content}</p>
                <div className="comment-item-actions">
                  <ContentLikeButton
                    compact
                    liked={item.likedByMe}
                    likeCount={item.likeCount}
                    disabled={
                      sessionQuery.isLoading ||
                      (commentLikeMutation.isPending && commentLikeMutation.variables === item.id)
                    }
                    onClick={() =>
                      sessionQuery.data?.isLogined
                        ? commentLikeMutation.mutate(item.id)
                        : goToLogin()
                    }
                  />
                  {sessionQuery.isLoading ? (
                    <button type="button" disabled>
                      확인 중
                    </button>
                  ) : reportNeedsLogin ? (
                    <Link
                      className="comment-report-login-link content-report-action"
                      to="/login"
                      search={{ returnTo: `/jbs/${postId}` }}
                    >
                      <Flag size={14} aria-hidden="true" /> 신고
                    </Link>
                  ) : (
                    <button
                      className="content-report-action"
                      type="button"
                      disabled={reportMutation.isPending}
                      onClick={() =>
                        reportMutation.mutate({
                          targetType: 'comment',
                          targetId: item.id,
                          reason: '부적절한 JBS 댓글',
                        })
                      }
                    >
                      <Flag
                        className={
                          reportedTargets.has(reportTargetKey('comment', item.id))
                            ? 'is-filled'
                            : undefined
                        }
                        size={14}
                        aria-hidden="true"
                      />
                      신고
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : commentsQuery.isSuccess ? (
          <p className="comment-empty">첫 댓글을 남겨보세요.</p>
        ) : null}

        {sessionQuery.data?.isLogined ? (
          <>
            <form className="detail-comment-form" onSubmit={submitComment}>
              <label className="sr-only" htmlFor="jbs-comment">
                댓글
              </label>
              <textarea
                id="jbs-comment"
                value={comment}
                maxLength={2000}
                rows={3}
                onChange={(event) => setComment(event.target.value)}
                placeholder="댓글을 입력하세요"
              />
              <button
                className="detail-primary-button"
                type="submit"
                disabled={!comment.trim() || commentMutation.isPending}
              >
                <Send size={15} aria-hidden="true" /> 등록
              </button>
            </form>
            <span className="mutation-feedback" role="status" aria-live="polite">
              {commentMutation.isError ? '댓글을 등록하지 못했습니다.' : null}
            </span>
          </>
        ) : sessionQuery.isLoading ? (
          <PageState kind="loading" variant="inline" title="로그인 상태를 확인하는 중입니다." />
        ) : (
          <div className="comment-login-prompt">
            <p>댓글을 작성하려면 로그인이 필요합니다.</p>
            <Link
              className="detail-secondary-button"
              to="/login"
              search={{ returnTo: `/jbs/${postId}` }}
            >
              로그인하기
            </Link>
          </div>
        )}
      </section>
      <div className="detail-bottom-actions">
        <Link className="detail-secondary-button" to="/jbs">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
