import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardPostSummary } from '@jshsus/types';
import { MessageSquareText, Send } from 'lucide-react';
import {
  createBoardComment,
  createBoardPost,
  createContentReport,
  getBoardComments,
  getBoardPosts,
  uploadFile,
} from '../../lib/api';

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
    commentMutation.mutate({ slug: 'free', postId: post.id, content: comment });
  };

  const handleReport = () => {
    const reason = window.prompt('신고 사유를 입력해주세요.');

    if (reason) {
      reportMutation.mutate({ targetType: 'post', targetId: post.id, reason });
    }
  };

  return (
    <article className="list-row expanded">
      <div className="post-body">
        <span className="row-meta">
          {post.isAnonymous ? '익명' : (post.authorName ?? '작성자')} ·{' '}
          {new Date(post.createdAt).toLocaleString('ko-KR')}
        </span>
        <h3>{post.title}</h3>
        <p>{post.content}</p>
        {post.attachments?.length ? (
          <div className="attachment-list">
            {post.attachments.map((file) => (
              <a href={file.url} key={file.id}>
                {file.originalName}
              </a>
            ))}
          </div>
        ) : null}
        <div className="comment-stack">
          {(commentsQuery.data ?? []).map((item) => (
            <div className="comment-row" key={item.id}>
              <strong>{item.authorName ?? '작성자'}</strong>
              <span>{item.content}</span>
              <button
                className="text-button"
                type="button"
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
            </div>
          ))}
        </div>
        <form className="inline-form" onSubmit={handleComment}>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="댓글 작성"
            required
          />
          <button className="quiet-button" type="submit" disabled={commentMutation.isPending}>
            댓글
          </button>
        </form>
      </div>
      <div className="row-actions">
        <span className="badge subtle">댓글 {post.commentCount}</span>
        <span className="badge subtle">조회 {post.viewCount}</span>
        <button className="quiet-button" type="button" onClick={handleReport}>
          신고
        </button>
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

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">게시판</span>
          <h2>자유게시판</h2>
          <p>학생들이 학교생활과 생활관 정보를 나누는 기본 게시판입니다.</p>
        </div>
        <div className="today-card">
          <MessageSquareText size={20} />
          <span>최근 글</span>
          <strong>{postsQuery.data?.length ?? 0}건</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <Send size={19} />
          <h2>글 작성</h2>
        </div>
        <form className="content-form" onSubmit={handleSubmit}>
          <label>
            <span>제목</span>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              maxLength={255}
              required
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isAnonymous}
              onChange={(event) =>
                setForm((current) => ({ ...current, isAnonymous: event.target.checked }))
              }
            />
            <span>익명으로 작성</span>
          </label>
          <label>
            <span>첨부</span>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="full-field">
            <span>내용</span>
            <textarea
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
              rows={5}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={createMutation.isPending}>
            등록
          </button>
        </form>
        {createMutation.isError ? (
          <p className="form-error">게시글 등록에는 로그인이 필요합니다.</p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <MessageSquareText size={19} />
          <h2>게시글 목록</h2>
        </div>
        {postsQuery.isLoading ? <p className="empty-text">게시글을 불러오는 중입니다.</p> : null}
        {postsQuery.isError ? <p className="empty-text">게시판 API 연결을 확인해주세요.</p> : null}
        <div className="list-stack">
          {(postsQuery.data ?? []).map((post) => (
            <PostCard post={post} key={post.id} />
          ))}
          {postsQuery.data?.length === 0 ? (
            <p className="empty-text">등록된 게시글이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
