import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardPostSummary } from '@jshsus/types';
import { Flag, MessageCircle, MessageSquareText, Paperclip, Send } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import {
  createBoardComment,
  createBoardPost,
  createContentReport,
  getBoardComments,
  getBoardPosts,
  uploadFile,
} from '../../lib/api';
import { createKoreanDateFormatter } from '../../lib/date';

const postDateFormatter = createKoreanDateFormatter({
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function PostCard({ post }: { post: BoardPostSummary }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const commentsQuery = useQuery({
    queryKey: ['board-comments', post.id],
    queryFn: () => getBoardComments('free', post.id),
  });
  const commentMutation = useMutation({
    mutationFn: createBoardComment,
    onSuccess: async () => {
      setComment('');
      await queryClient.invalidateQueries({ queryKey: ['board-comments', post.id] });
      await queryClient.invalidateQueries({ queryKey: ['board-posts', 'free'] });
    },
  });
  const reportMutation = useMutation({ mutationFn: createContentReport });

  const handleComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!comment.trim()) {
      return;
    }

    commentMutation.mutate({ slug: 'free', postId: post.id, content: comment.trim() });
  };

  const handleReport = () => {
    const reason = window.prompt('신고 사유를 입력해 주세요.');

    if (reason?.trim()) {
      reportMutation.mutate({ targetType: 'post', targetId: post.id, reason: reason.trim() });
    }
  };

  return (
    <article className="item-card post-card">
      <div className="item-card__main">
        <div className="item-card__meta">
          <StatusBadge tone={post.isAnonymous ? 'neutral' : 'brand'}>
            {post.isAnonymous ? '익명' : (post.authorName ?? '작성자')}
          </StatusBadge>
          <time dateTime={post.createdAt}>
            {postDateFormatter.format(new Date(post.createdAt))}
          </time>
        </div>
        <h3 className="item-card__title">{post.title}</h3>
        <p className="item-card__content">{post.content}</p>

        {post.attachments?.length ? (
          <div className="attachment-list" aria-label="첨부 파일">
            {post.attachments.map((file) => (
              <a className="attachment-chip" href={file.url} key={file.id}>
                <Paperclip size={14} aria-hidden="true" />
                {file.originalName}
              </a>
            ))}
          </div>
        ) : null}

        <section className="comment-section" aria-label={`${post.title}의 댓글`}>
          <div className="comment-section__header">
            <strong>댓글</strong>
            <span>{post.commentCount}개</span>
          </div>
          {commentsQuery.isLoading ? (
            <StateMessage kind="loading" title="댓글을 불러오는 중입니다." compact />
          ) : null}
          {commentsQuery.isError ? (
            <StateMessage kind="error" title="댓글을 불러오지 못했습니다." compact />
          ) : null}
          {commentsQuery.isSuccess && commentsQuery.data.length === 0 ? (
            <p className="comment-section__empty">첫 댓글을 남겨 보세요.</p>
          ) : null}
          {commentsQuery.data?.length ? (
            <div className="comment-list">
              {commentsQuery.data.map((item) => (
                <div className="comment-item" key={item.id}>
                  <strong className="comment-item__author">{item.authorName ?? '작성자'}</strong>
                  <span className="comment-item__content">{item.content}</span>
                  <button
                    className="portal-button portal-button--text"
                    type="button"
                    onClick={() =>
                      reportMutation.mutate({
                        targetType: 'comment',
                        targetId: item.id,
                        reason: '부적절한 댓글',
                      })
                    }
                    disabled={reportMutation.isPending}
                    aria-label={`${item.authorName ?? '작성자'}의 댓글 신고`}
                  >
                    신고
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form className="inline-composer" onSubmit={handleComment}>
            <label className="sr-only" htmlFor={`comment-${post.id}`}>
              댓글 내용
            </label>
            <input
              id={`comment-${post.id}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="댓글을 입력해 주세요."
              maxLength={1000}
              required
            />
            <button
              className="portal-button portal-button--secondary"
              type="submit"
              disabled={commentMutation.isPending || !comment.trim()}
            >
              {commentMutation.isPending ? '등록 중…' : '댓글 등록'}
            </button>
          </form>
          {commentMutation.isError ? (
            <StateMessage
              kind="error"
              title="댓글을 등록하지 못했습니다."
              description="로그인 상태를 확인해 주세요."
              compact
            />
          ) : null}
        </section>
      </div>

      <div className="item-card__aside">
        <div className="post-metrics" aria-label="게시글 통계">
          <span>
            <MessageCircle size={14} aria-hidden="true" /> 댓글 {post.commentCount}
          </span>
          <span>조회 {post.viewCount}</span>
        </div>
        <button
          className="portal-button portal-button--text"
          type="button"
          onClick={handleReport}
          disabled={reportMutation.isPending}
        >
          <Flag size={14} aria-hidden="true" />
          {reportMutation.isPending ? '신고 중…' : '게시글 신고'}
        </button>
        {reportMutation.isSuccess && reportMutation.variables?.targetType === 'post' ? (
          <span className="action-feedback" role="status">
            신고가 접수되었습니다.
          </span>
        ) : null}
        {reportMutation.isError && reportMutation.variables?.targetType === 'post' ? (
          <span className="action-feedback action-feedback--error" role="alert">
            신고를 접수하지 못했습니다.
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function BoardPage() {
  const queryClient = useQueryClient();
  const postsQuery = useQuery({
    queryKey: ['board-posts', 'free'],
    queryFn: () => getBoardPosts('free'),
  });
  const [form, setForm] = useState({
    title: '',
    content: '',
    isAnonymous: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useMutation({
    mutationFn: async (input: {
      title: string;
      content: string;
      isAnonymous: boolean;
      file: File | null;
    }) => {
      const result = await createBoardPost({
        slug: 'free',
        title: input.title,
        content: input.content,
        isAnonymous: input.isAnonymous,
      });

      if (input.file) {
        await uploadFile({
          file: input.file,
          targetType: 'post',
          targetId: result.post.id,
          visibility: 'public',
        });
      }

      return result;
    },
    onSuccess: async () => {
      setForm({ title: '', content: '', isAnonymous: false });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: ['board-posts', 'free'] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({
      title: form.title,
      content: form.content,
      isAnonymous: form.isAnonymous,
      file,
    });
  };

  const posts = postsQuery.data ?? [];

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="커뮤니티"
        title="자유게시판"
        description="학교생활에 관한 생각과 유용한 정보를 자유롭게 나누세요."
        stat={{ icon: MessageSquareText, label: '게시글', value: `${posts.length}건` }}
      />

      <Panel
        title="새 글 작성"
        description="서로를 존중하는 표현을 사용하고 개인정보는 게시하지 마세요."
        icon={Send}
      >
        <form className="portal-form" onSubmit={handleSubmit}>
          <div className="portal-form__grid">
            <label className="portal-field portal-field--wide" htmlFor="board-title">
              <span className="portal-field__label">제목</span>
              <input
                id="board-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                maxLength={255}
                placeholder="게시글 제목을 입력해 주세요."
                required
              />
            </label>
            <label className="portal-field portal-field--wide" htmlFor="board-content">
              <span className="portal-field__label">내용</span>
              <textarea
                id="board-content"
                value={form.content}
                onChange={(event) =>
                  setForm((current) => ({ ...current, content: event.target.value }))
                }
                rows={6}
                placeholder="나누고 싶은 내용을 작성해 주세요."
                required
              />
            </label>
            <label className="portal-field" htmlFor="board-file">
              <span className="portal-field__label">첨부 파일</span>
              <input
                id="board-file"
                ref={fileInputRef}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="portal-field__hint">
                필요한 경우 파일 하나를 첨부할 수 있습니다.
              </span>
            </label>
            <label className="portal-checkbox" htmlFor="board-anonymous">
              <input
                id="board-anonymous"
                type="checkbox"
                checked={form.isAnonymous}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isAnonymous: event.target.checked }))
                }
              />
              <span>작성자 이름을 익명으로 표시</span>
            </label>
          </div>
          <div className="portal-actions">
            <button
              className="portal-button portal-button--primary"
              type="submit"
              disabled={createMutation.isPending}
            >
              <Send size={16} aria-hidden="true" />
              {createMutation.isPending ? '등록 중…' : '게시글 등록'}
            </button>
          </div>
        </form>
        {createMutation.isError ? (
          <StateMessage
            kind="error"
            title="게시글을 등록하지 못했습니다."
            description="로그인 상태와 입력 내용을 확인해 주세요."
            compact
          />
        ) : null}
      </Panel>

      <Panel
        title="게시글 목록"
        icon={MessageSquareText}
        action={<span className="portal-panel__count">총 {posts.length}건</span>}
      >
        {postsQuery.isLoading ? (
          <StateMessage kind="loading" title="게시글을 불러오고 있습니다." />
        ) : null}
        {postsQuery.isError ? (
          <StateMessage
            kind="error"
            title="게시글을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        ) : null}
        {postsQuery.isSuccess && posts.length === 0 ? (
          <StateMessage
            kind="empty"
            title="등록된 게시글이 없습니다."
            description="첫 번째 이야기를 남겨 보세요."
          />
        ) : null}
        {posts.length > 0 ? (
          <div className="item-list">
            {posts.map((post) => (
              <PostCard post={post} key={post.id} />
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
