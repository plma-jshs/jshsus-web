import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MessageSquareWarning, PackageSearch } from 'lucide-react';
import { api } from '../lib/api';

export function ContentPage() {
  const queryClient = useQueryClient();
  const noticesQuery = useQuery({ queryKey: ['admin-notices'], queryFn: api.notices });
  const postsQuery = useQuery({ queryKey: ['admin-board-posts'], queryFn: api.boardPosts });
  const lostItemsQuery = useQuery({ queryKey: ['admin-lost-items'], queryFn: api.lostItems });
  const reportsQuery = useQuery({ queryKey: ['admin-reports'], queryFn: api.reports });
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    department: '학생생활부',
    content: '',
    pinned: false,
  });
  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  const [activePostId, setActivePostId] = useState<number | null>(null);
  const commentsQuery = useQuery({
    queryKey: ['admin-board-comments', activePostId],
    queryFn: () => api.boardComments(activePostId ?? 0),
    enabled: Boolean(activePostId),
  });

  const refreshContent = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-notices'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-board-posts'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-lost-items'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-board-comments'] }),
    ]);
  };

  const createNoticeMutation = useMutation({
    mutationFn: async () => {
      const result = await api.createNotice(noticeForm);

      if (noticeFile) {
        await api.uploadFile({
          file: noticeFile,
          targetType: 'notice',
          targetId: result.notice.id,
          visibility: 'public',
        });
      }

      return result;
    },
    onSuccess: async () => {
      setNoticeForm({ title: '', department: '학생생활부', content: '', pinned: false });
      setNoticeFile(null);
      await refreshContent();
    },
  });
  const deleteNoticeMutation = useMutation({
    mutationFn: api.deleteNotice,
    onSuccess: refreshContent,
  });
  const updateNoticeMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.updateNotice(id, { pinned }),
    onSuccess: refreshContent,
  });
  const togglePostMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: number; isHidden: boolean }) =>
      api.updatePostHidden(id, isHidden),
    onSuccess: refreshContent,
  });
  const toggleCommentMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: number; isHidden: boolean }) =>
      api.updateCommentHidden(id, isHidden),
    onSuccess: refreshContent,
  });
  const updateLostStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: 'open' | 'matched' | 'closed' | 'hidden';
    }) => api.updateLostItemStatus(id, status),
    onSuccess: refreshContent,
  });
  const updateReportMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.updateReportStatus(id, status),
    onSuccess: refreshContent,
  });

  const activePost = useMemo(
    () => (postsQuery.data ?? []).find((post) => post.id === activePostId),
    [activePostId, postsQuery.data],
  );

  const handleCreateNotice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createNoticeMutation.mutate();
  };

  return (
    <div className="admin-stack">
      <section className="metric-grid compact">
        <article className="metric-card">
          <FileText size={20} />
          <span>공지</span>
          <strong>{noticesQuery.data?.length ?? 0}</strong>
        </article>
        <article className="metric-card">
          <MessageSquareWarning size={20} />
          <span>신고</span>
          <strong>
            {reportsQuery.data?.filter((report) => report.status === 'open').length ?? 0}
          </strong>
        </article>
        <article className="metric-card">
          <PackageSearch size={20} />
          <span>열린 분실물</span>
          <strong>
            {lostItemsQuery.data?.filter((item) => item.status === 'open').length ?? 0}
          </strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>공지 작성</h2>
        </div>
        <form className="admin-form-grid content-admin-form" onSubmit={handleCreateNotice}>
          <label>
            <span>제목</span>
            <input
              value={noticeForm.title}
              onChange={(event) =>
                setNoticeForm((form) => ({ ...form, title: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>부서</span>
            <input
              value={noticeForm.department}
              onChange={(event) =>
                setNoticeForm((form) => ({ ...form, department: event.target.value }))
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={noticeForm.pinned}
              onChange={(event) =>
                setNoticeForm((form) => ({ ...form, pinned: event.target.checked }))
              }
            />
            <span>고정</span>
          </label>
          <label>
            <span>첨부</span>
            <input
              type="file"
              onChange={(event) => setNoticeFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="full-field">
            <span>내용</span>
            <textarea
              value={noticeForm.content}
              onChange={(event) =>
                setNoticeForm((form) => ({ ...form, content: event.target.value }))
              }
              rows={5}
              required
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={createNoticeMutation.isPending}
          >
            게시
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>공지 목록</h2>
        </div>
        <div className="ops-list">
          {(noticesQuery.data ?? []).map((notice) => (
            <article className="ops-row" key={notice.id}>
              <div>
                <strong>{notice.title}</strong>
                <span>
                  {notice.department} · {notice.pinned ? '고정' : '일반'}
                </span>
                {notice.attachments?.length ? <em>첨부 {notice.attachments.length}개</em> : null}
              </div>
              <button
                className="table-action"
                type="button"
                onClick={() =>
                  updateNoticeMutation.mutate({ id: notice.id, pinned: !notice.pinned })
                }
              >
                {notice.pinned ? '고정 해제' : '고정'}
              </button>
              <button
                className="table-action danger"
                type="button"
                onClick={() => deleteNoticeMutation.mutate(notice.id)}
              >
                삭제
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>게시판 숨김 관리</h2>
        </div>
        <div className="ops-list">
          {(postsQuery.data ?? []).map((post) => (
            <article className="ops-row" key={post.id}>
              <div>
                <strong>{post.title}</strong>
                <span>
                  {post.authorName ?? '익명'} · 댓글 {post.commentCount}개 ·{' '}
                  {post.isHidden ? '숨김' : '노출'}
                </span>
              </div>
              <div className="ops-actions">
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setActivePostId(post.id)}
                >
                  댓글
                </button>
                <button
                  className="table-action"
                  type="button"
                  onClick={() =>
                    togglePostMutation.mutate({ id: post.id, isHidden: !post.isHidden })
                  }
                >
                  {post.isHidden ? '노출' : '숨김'}
                </button>
              </div>
            </article>
          ))}
        </div>
        {activePost ? (
          <div className="nested-panel">
            <h3>{activePost.title} 댓글</h3>
            {(commentsQuery.data ?? []).map((comment) => (
              <div className="ops-row compact-row" key={comment.id}>
                <div>
                  <strong>{comment.authorName ?? '작성자'}</strong>
                  <span>{comment.content}</span>
                </div>
                <button
                  className="table-action"
                  type="button"
                  onClick={() =>
                    toggleCommentMutation.mutate({ id: comment.id, isHidden: !comment.isHidden })
                  }
                >
                  {comment.isHidden ? '노출' : '숨김'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>분실물 상태</h2>
        </div>
        <div className="ops-list">
          {(lostItemsQuery.data ?? []).map((item) => (
            <article className="ops-row" key={item.id}>
              <div>
                <strong>{item.itemName}</strong>
                <span>
                  {item.location || '장소 미입력'} · {item.status}
                </span>
              </div>
              <select
                value={item.status}
                onChange={(event) =>
                  updateLostStatusMutation.mutate({
                    id: item.id,
                    status: event.target.value as 'open' | 'matched' | 'closed' | 'hidden',
                  })
                }
              >
                <option value="open">접수</option>
                <option value="matched">매칭</option>
                <option value="closed">완료</option>
                <option value="hidden">숨김</option>
              </select>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>신고 처리</h2>
        </div>
        <div className="ops-list">
          {(reportsQuery.data ?? []).map((report) => (
            <article className="ops-row" key={report.id}>
              <div>
                <strong>{report.reason}</strong>
                <span>
                  {report.targetType} #{report.targetId} · {report.status}
                </span>
                {report.detail ? <em>{report.detail}</em> : null}
              </div>
              <div className="ops-actions">
                <button
                  className="table-action"
                  type="button"
                  onClick={() =>
                    updateReportMutation.mutate({ id: report.id, status: 'reviewing' })
                  }
                >
                  검토
                </button>
                <button
                  className="table-action"
                  type="button"
                  onClick={() => updateReportMutation.mutate({ id: report.id, status: 'closed' })}
                >
                  종료
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
