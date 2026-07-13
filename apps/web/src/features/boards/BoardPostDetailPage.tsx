import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Eye, Flag, MessageCircle, Paperclip, Send } from 'lucide-react';
import { getRichTextImageSources, RichTextContent } from '../../components/editor/RichTextEditor';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { createContentReport } from '../../shared/api/reports';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { authActionRequiresLogin } from '../auth/action-access';
import { getSession } from '../auth/api';
import { createBoardComment, getBoardComments, getBoardPost } from './api';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function BoardPostDetailPage() {
  const { postId } = useParams({ from: '/boards/free/$postId' });
  const numericId = Number(postId);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const postQuery = useQuery({
    queryKey: ['board-post', 'free', numericId],
    queryFn: () => getBoardPost('free', numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const commentsQuery = useQuery({
    queryKey: ['board-comments', numericId],
    queryFn: () => getBoardComments('free', numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const post = postQuery.data;
  const commentMutation = useMutation({
    mutationFn: () =>
      createBoardComment({ slug: 'free', postId: numericId, content: comment.trim() }),
    onSuccess: async () => {
      setComment('');
      await queryClient.invalidateQueries({ queryKey: ['board-comments', numericId] });
    },
  });
  const reportMutation = useMutation({ mutationFn: createContentReport });
  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (comment.trim() && sessionQuery.data?.isLogined) commentMutation.mutate();
  };

  if (postQuery.isLoading) return <PageState kind="loading" title="게시글을 불러오는 중입니다." />;
  if (postQuery.isError || !post) {
    const status = postQuery.error instanceof ApiError ? postQuery.error.status : 0;
    const isNotFound = !Number.isInteger(numericId) || numericId < 1 || status === 404;
    const isForbidden = status === 401 || status === 403;
    return (
      <PageScaffold
        breadcrumbs={[{ label: '자유게시판', to: '/boards/free' }]}
        title={
          isNotFound
            ? '게시글을 찾을 수 없습니다'
            : isForbidden
              ? '공개되지 않은 게시글입니다'
              : '게시글을 불러오지 못했습니다'
        }
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            isNotFound
              ? '삭제되었거나 존재하지 않는 게시글입니다.'
              : isForbidden
                ? '이 게시글을 볼 권한이 없습니다.'
                : '서버와 통신하지 못했습니다.'
          }
          description={isNotFound || isForbidden ? undefined : '잠시 후 다시 시도해 주세요.'}
          action={
            isNotFound || isForbidden ? (
              <Link className="detail-secondary-button" to="/boards/free">
                게시판으로
              </Link>
            ) : (
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => postQuery.refetch()}
              >
                다시 시도
              </button>
            )
          }
        />
      </PageScaffold>
    );
  }

  const inlineImageSources = getRichTextImageSources(post.contentDoc);
  const downloadableAttachments = post.attachments.filter(
    (file) =>
      !inlineImageSources.has(file.inlineUrl) &&
      !inlineImageSources.has(`/api/files/${file.id}/content`),
  );
  const reportNeedsLogin = authActionRequiresLogin(sessionQuery.data, reportMutation.error);

  return (
    <PageScaffold
      breadcrumbs={[
        { label: '커뮤니티' },
        { label: '자유게시판', to: '/boards/free' },
        { label: '상세' },
      ]}
      title={post.title}
      width="reading"
      variant="document"
      meta={
        <>
          <span>{post.isAnonymous ? '익명' : (post.authorName ?? '작성자')}</span>
          <time dateTime={post.createdAt}>{dateFormatter.format(new Date(post.createdAt))}</time>
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
        </>
      }
    >
      <article className="reading-surface">
        <div className="reading-body">
          <RichTextContent contentDoc={post.contentDoc} plainText={post.content} />
        </div>
        {downloadableAttachments.length ? (
          <div className="detail-attachments">
            {downloadableAttachments.map((file) => (
              <a href={file.url} key={file.id}>
                <span>
                  <Paperclip size={14} aria-hidden="true" /> {file.originalName}
                </span>
              </a>
            ))}
          </div>
        ) : null}
        <div className="post-detail-actions">
          {sessionQuery.isLoading ? (
            <button type="button" disabled>
              로그인 상태 확인 중
            </button>
          ) : reportNeedsLogin ? (
            <Link
              className="auth-required-action"
              to="/login"
              search={{ returnTo: `/boards/free/${postId}` }}
            >
              <Flag size={14} aria-hidden="true" /> 로그인하고 신고
            </Link>
          ) : (
            <button
              type="button"
              disabled={reportMutation.isPending}
              onClick={() =>
                reportMutation.mutate({
                  targetType: 'post',
                  targetId: post.id,
                  reason: '부적절한 게시글',
                })
              }
            >
              <Flag size={14} aria-hidden="true" /> 신고
            </button>
          )}
          <span className="mutation-feedback" role="status" aria-live="polite">
            {reportMutation.variables?.targetType === 'post'
              ? reportMutation.isSuccess
                ? '신고를 접수했습니다.'
                : reportMutation.isError && !reportNeedsLogin
                  ? '신고를 접수하지 못했습니다.'
                  : null
              : null}
          </span>
        </div>
      </article>
      <section className="comment-surface" aria-labelledby="comments-title">
        <header>
          <h2 id="comments-title">
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
                  <time>{dateFormatter.format(new Date(item.createdAt))}</time>
                </div>
                <p>{item.content}</p>
                {sessionQuery.isLoading ? (
                  <button type="button" disabled>
                    확인 중
                  </button>
                ) : reportNeedsLogin ? (
                  <Link
                    className="comment-report-login-link"
                    to="/login"
                    search={{ returnTo: `/boards/free/${postId}` }}
                  >
                    로그인 후 신고
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={reportMutation.isPending}
                    onClick={() =>
                      reportMutation.mutate({
                        targetType: 'comment',
                        targetId: item.id,
                        reason: '부적절한 댓글',
                      })
                    }
                  >
                    신고
                  </button>
                )}
                {reportMutation.variables?.targetType === 'comment' &&
                reportMutation.variables.targetId === item.id ? (
                  <span className="comment-report-feedback" role="status" aria-live="polite">
                    {reportMutation.isSuccess
                      ? '신고를 접수했습니다.'
                      : reportMutation.isError && !reportNeedsLogin
                        ? '신고를 접수하지 못했습니다.'
                        : reportMutation.isPending
                          ? '신고 접수 중'
                          : null}
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        ) : commentsQuery.isSuccess ? (
          <p className="comment-empty">첫 댓글을 남겨보세요.</p>
        ) : null}
        {sessionQuery.isLoading ? (
          <PageState kind="loading" variant="inline" title="로그인 상태를 확인하는 중입니다." />
        ) : sessionQuery.data?.isLogined ? (
          <>
            <form className="detail-comment-form" onSubmit={submitComment}>
              <label className="sr-only" htmlFor="post-comment">
                댓글
              </label>
              <textarea
                id="post-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="댓글을 입력하세요"
                rows={3}
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
              {commentMutation.isSuccess
                ? '댓글을 등록했습니다.'
                : commentMutation.isError
                  ? '댓글을 등록하지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.'
                  : null}
            </span>
          </>
        ) : (
          <div className="comment-login-prompt">
            <p>댓글을 작성하려면 로그인이 필요합니다.</p>
            <Link
              className="detail-secondary-button"
              to="/login"
              search={{ returnTo: `/boards/free/${postId}` }}
            >
              로그인하기
            </Link>
          </div>
        )}
      </section>
      <div className="detail-bottom-actions">
        <Link className="detail-secondary-button" to="/boards/free">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
