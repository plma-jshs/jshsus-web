import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { BoardCommentSummary, BoardPostSummary, ContentReportSummary } from '@jshsus/types';
import { Eye, EyeOff, Search, Settings2, ShieldAlert } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Drawer,
  PageSizeSelect,
  RowActionButton,
  RowActions,
  SelectedRowsHeaderAction,
  TableSelectionCheckbox,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import {
  ContentAdminPanel,
  ContentQueryState,
  MutationMessage,
  formatAdminDate,
} from './components/ContentAdminPanel';
import { useContentReports } from './hooks/useContentReports';
import { publicSiteHref } from './publicSiteHref';

export type CommunityBoardSource = {
  slug: string;
  label: string;
  loadPosts: () => Promise<BoardPostSummary[]>;
  loadComments: (postId: number) => Promise<BoardCommentSummary[]>;
};

export const freeBoardSource: CommunityBoardSource = {
  slug: 'free',
  label: '자유게시판',
  loadPosts: api.boardPosts,
  loadComments: api.boardComments,
};

type CommunityModerationPageProps = {
  sources?: readonly CommunityBoardSource[];
  initialBoardSlug?: string;
};

const reportStatusLabel: Record<string, string> = {
  open: '접수',
  reviewing: '검토 중',
  closed: '처리 완료',
  rejected: '반려',
};

const reportTargetLabel: Record<ContentReportSummary['targetType'], string> = {
  post: '게시글',
  comment: '댓글',
  lost_item: '분실물',
};

const COMMUNITY_REPORT_TARGETS = ['post', 'comment'] as const;

export function CommunityModerationPage({
  sources = [freeBoardSource],
  initialBoardSlug = sources[0]?.slug ?? 'free',
}: CommunityModerationPageProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeBoardSlug, setActiveBoardSlug] = useState(initialBoardSlug);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [postSearch, setPostSearch] = useState('');
  const [postVisibility, setPostVisibility] = useState<'all' | 'published' | 'draft' | 'hidden'>(
    'all',
  );
  const [reportStatus, setReportStatus] = useState('all');
  const [postPageSize, setPostPageSize] = useState(20);
  const [commentPageSize, setCommentPageSize] = useState(20);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [selectedReportIds, setSelectedReportIds] = useState<Set<number>>(() => new Set());
  const [postSorting, setPostSorting] = useState<SortingState>([{ id: 'id', desc: true }]);

  const activeSource =
    sources.find((source) => source.slug === activeBoardSlug) ?? sources[0] ?? freeBoardSource;

  const postsQuery = useQuery({
    queryKey: ['admin-board-posts', activeSource.slug],
    queryFn: activeSource.loadPosts,
  });
  const { reports, reportsQuery, updateReportMutation } =
    useContentReports(COMMUNITY_REPORT_TARGETS);
  const completeSelectedReportsMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => api.updateReportStatus(id, 'closed'))),
    onSuccess: async (_, ids) => {
      setSelectedReportIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      showToast({ title: `신고 ${ids.length}건을 처리 완료했습니다.`, tone: 'success' });
    },
    onError: () => showToast({ title: '선택한 신고를 처리하지 못했습니다.', tone: 'danger' }),
  });
  const commentsQuery = useQuery({
    queryKey: ['admin-board-comments', activeSource.slug, selectedPostId],
    queryFn: () => activeSource.loadComments(selectedPostId ?? 0),
    enabled: selectedPostId !== null,
  });

  const refreshPosts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-board-posts', activeSource.slug] }),
      queryClient.invalidateQueries({ queryKey: ['admin-board-comments', activeSource.slug] }),
    ]);
  };

  const togglePostMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: number; isHidden: boolean }) =>
      api.updatePostHidden(id, isHidden),
    onSuccess: async (_, variables) => {
      await refreshPosts();
      showToast({
        title: variables.isHidden ? '게시글을 숨겼습니다.' : '게시글을 공개했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '게시글 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });
  const toggleCommentMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: number; isHidden: boolean }) =>
      api.updateCommentHidden(id, isHidden),
    onSuccess: async (_, variables) => {
      await refreshPosts();
      showToast({
        title: variables.isHidden ? '댓글을 숨겼습니다.' : '댓글을 공개했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '댓글 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });
  const filteredPosts = useMemo(() => {
    const keyword = postSearch.trim().toLocaleLowerCase('ko-KR');
    return (postsQuery.data ?? []).filter((post) => {
      if (postVisibility === 'published' && (post.isHidden || post.status !== 'published')) {
        return false;
      }
      if (postVisibility === 'draft' && (post.isHidden || post.status !== 'draft')) return false;
      if (postVisibility === 'hidden' && !post.isHidden) return false;
      if (!keyword) return true;
      return [post.title, post.authorName, post.content]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('ko-KR').includes(keyword));
    });
  }, [postSearch, postVisibility, postsQuery.data]);

  const communityReports = useMemo(
    () => reports.filter((report) => reportStatus === 'all' || report.status === reportStatus),
    [reportStatus, reports],
  );
  const visibleReportIds = useMemo(
    () => communityReports.map((report) => report.id),
    [communityReports],
  );
  const allVisibleReportsSelected =
    visibleReportIds.length > 0 && visibleReportIds.every((id) => selectedReportIds.has(id));
  const someVisibleReportsSelected = visibleReportIds.some((id) => selectedReportIds.has(id));
  const selectedReportCount = visibleReportIds.filter((id) => selectedReportIds.has(id)).length;

  const selectedPost = (postsQuery.data ?? []).find((post) => post.id === selectedPostId);
  const selectedReport = reports.find((report) => report.id === selectedReportId);

  const toggleVisibleReports = useCallback(
    (checked: boolean) => {
      setSelectedReportIds(checked ? new Set(visibleReportIds) : new Set());
    },
    [visibleReportIds],
  );

  const toggleReport = useCallback((id: number, checked: boolean) => {
    setSelectedReportIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const completeSelectedReports = useCallback(() => {
    const ids = visibleReportIds.filter((id) => selectedReportIds.has(id));
    if (ids.length === 0 || completeSelectedReportsMutation.isPending) return;
    if (!window.confirm(`선택한 신고 ${ids.length}건을 처리 완료하시겠습니까?`)) return;
    completeSelectedReportsMutation.mutate(ids);
  }, [completeSelectedReportsMutation, selectedReportIds, visibleReportIds]);

  const postColumns = useMemo<ColumnDef<BoardPostSummary>[]>(
    () => [
      {
        accessorKey: 'id',
        header: '번호',
        cell: ({ row }) => row.original.publicNumber,
        meta: { align: 'center', width: 72 },
      },
      {
        accessorKey: 'title',
        header: '제목',
        cell: ({ row }) => (
          <div className="content-title-cell">
            <a
              className="content-table-primary"
              href={publicSiteHref(`/boards/${activeSource.slug}/${row.original.id}`)}
            >
              {row.original.title}
            </a>
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'authorName',
        header: '작성자',
        cell: ({ row }) =>
          row.original.isAnonymous ? '익명' : row.original.authorName || '알 수 없음',
        enableSorting: false,
        meta: { align: 'center', width: 120 },
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        cell: ({ row }) => formatAdminDate(row.original.createdAt),
        meta: { align: 'center', width: 128 },
      },
      {
        accessorKey: 'viewCount',
        header: '조회',
        cell: ({ row }) => row.original.viewCount.toLocaleString('ko-KR'),
        meta: { align: 'center', width: 84 },
      },
      {
        accessorKey: 'commentCount',
        header: '댓글',
        cell: ({ row }) => row.original.commentCount.toLocaleString('ko-KR'),
        meta: { align: 'center', width: 84 },
      },
      {
        accessorKey: 'isHidden',
        header: '상태',
        cell: ({ row }) => {
          const tone = row.original.isHidden
            ? 'danger'
            : row.original.status === 'draft'
              ? 'neutral'
              : 'success';
          const label = row.original.isHidden
            ? '숨김'
            : row.original.status === 'draft'
              ? '임시 저장'
              : '공개';
          return <span className={`status-chip ${tone}`}>{label}</span>;
        },
        enableSorting: false,
        meta: { align: 'center', width: 96 },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={<Settings2 aria-hidden="true" />}
              label={`${row.original.title} 관리`}
              onClick={() => setSelectedPostId(row.original.id)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
    ],
    [activeSource.slug],
  );

  const reportColumns = useMemo<ColumnDef<ContentReportSummary>[]>(
    () => [
      {
        id: 'selection',
        header: () => (
          <TableSelectionCheckbox
            label="신고 전체 선택"
            checked={allVisibleReportsSelected}
            indeterminate={someVisibleReportsSelected && !allVisibleReportsSelected}
            disabled={visibleReportIds.length === 0 || completeSelectedReportsMutation.isPending}
            onChange={toggleVisibleReports}
          />
        ),
        cell: ({ row }) => (
          <TableSelectionCheckbox
            label={`신고 #${row.original.id} 선택`}
            checked={selectedReportIds.has(row.original.id)}
            disabled={completeSelectedReportsMutation.isPending}
            onChange={(checked) => toggleReport(row.original.id, checked)}
          />
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
      {
        accessorKey: 'targetType',
        header: () => (
          <SelectedRowsHeaderAction
            selectedCount={selectedReportCount}
            defaultLabel="대상"
            deleteLabel="처리 완료"
            variant="primary"
            loading={completeSelectedReportsMutation.isPending}
            loadingLabel="처리 중"
            onDelete={completeSelectedReports}
          />
        ),
        cell: ({ row }) =>
          `${reportTargetLabel[row.original.targetType]} #${row.original.targetId}`,
        enableSorting: selectedReportCount === 0,
        meta: { align: 'center', width: 112 },
      },
      {
        accessorKey: 'reason',
        header: '신고 사유',
        cell: ({ row }) => <strong className="content-table-primary">{row.original.reason}</strong>,
        enableSorting: false,
      },
      {
        accessorKey: 'reporterName',
        header: '신고자',
        cell: ({ row }) => row.original.reporterName || '익명',
        enableSorting: false,
        meta: { align: 'center', width: 112 },
      },
      {
        accessorKey: 'createdAt',
        header: '접수일',
        cell: ({ row }) => formatAdminDate(row.original.createdAt),
        meta: { align: 'center', width: 128 },
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => (
          <span
            className={`status-chip ${row.original.status === 'closed' ? 'success' : 'warning'}`}
          >
            {reportStatusLabel[row.original.status] ?? row.original.status}
          </span>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 104 },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={<Settings2 aria-hidden="true" />}
              label={`${reportTargetLabel[row.original.targetType]} 신고 관리`}
              onClick={() => setSelectedReportId(row.original.id)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
    ],
    [
      allVisibleReportsSelected,
      completeSelectedReports,
      completeSelectedReportsMutation.isPending,
      selectedReportCount,
      selectedReportIds,
      someVisibleReportsSelected,
      toggleReport,
      toggleVisibleReports,
      visibleReportIds.length,
    ],
  );

  const commentColumns = useMemo<ColumnDef<BoardCommentSummary>[]>(
    () => [
      {
        accessorKey: 'authorName',
        header: '작성자',
        cell: ({ row }) => row.original.authorName || '알 수 없음',
        enableSorting: false,
        meta: { align: 'center', width: 112 },
      },
      {
        accessorKey: 'content',
        header: '댓글 내용',
        cell: ({ row }) => <span className="content-comment-copy">{row.original.content}</span>,
        enableSorting: false,
      },
      {
        accessorKey: 'createdAt',
        header: '작성일',
        cell: ({ row }) => formatAdminDate(row.original.createdAt),
        meta: { align: 'center', width: 128 },
      },
      {
        accessorKey: 'isHidden',
        header: '상태',
        cell: ({ row }) => (
          <span className={`status-chip ${row.original.isHidden ? 'danger' : 'success'}`}>
            {row.original.isHidden ? '숨김' : '공개'}
          </span>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 88 },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={
                row.original.isHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />
              }
              label={row.original.isHidden ? '댓글 공개' : '댓글 숨김'}
              variant={row.original.isHidden ? 'primary' : 'danger'}
              disabled={toggleCommentMutation.isPending}
              onClick={() =>
                toggleCommentMutation.mutate({
                  id: row.original.id,
                  isHidden: !row.original.isHidden,
                })
              }
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
    ],
    [toggleCommentMutation],
  );

  return (
    <div className="admin-stack">
      <ContentAdminPanel
        title="자유게시판 관리"
        count={postsQuery.data?.length ?? 0}
        actions={
          <div className="content-toolbar">
            {sources.length > 1 ? (
              <label className="content-select-field">
                <span className="sr-only">게시판 선택</span>
                <select
                  value={activeSource.slug}
                  onChange={(event) => {
                    setActiveBoardSlug(event.target.value);
                    setSelectedPostId(null);
                  }}
                >
                  {sources.map((source) => (
                    <option key={source.slug} value={source.slug}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="content-search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">게시글 검색</span>
              <input
                value={postSearch}
                onChange={(event) => setPostSearch(event.target.value)}
                placeholder="제목, 작성자 검색"
              />
            </label>
            <label className="content-select-field">
              <span className="sr-only">게시글 공개 상태</span>
              <select
                value={postVisibility}
                onChange={(event) => setPostVisibility(event.target.value as typeof postVisibility)}
              >
                <option value="all">전체 상태</option>
                <option value="published">공개</option>
                <option value="draft">임시 저장</option>
                <option value="hidden">숨김</option>
              </select>
            </label>
            <PageSizeSelect value={postPageSize} onChange={setPostPageSize} />
          </div>
        }
      >
        <ContentQueryState
          isPending={postsQuery.isPending}
          error={postsQuery.error}
          hasData={filteredPosts.length > 0}
          resource={`${activeSource.label} 게시글`}
          emptyText={
            postSearch ? '검색 조건에 맞는 게시글이 없습니다.' : '등록된 게시글이 없습니다.'
          }
          onRetry={() => void postsQuery.refetch()}
        >
          <DataTable
            columns={postColumns}
            data={filteredPosts}
            loading={postsQuery.isPending}
            loadingText="게시글을 불러오는 중입니다."
            emptyText={
              postSearch ? '검색 조건에 맞는 게시글이 없습니다.' : '등록된 게시글이 없습니다.'
            }
            alwaysShowPagination
            pageSize={postPageSize}
            sorting={postSorting}
            onSortingChange={setPostSorting}
            caption={`${activeSource.label} 게시글 관리 목록`}
          />
        </ContentQueryState>
        <MutationMessage
          isPending={togglePostMutation.isPending}
          error={togglePostMutation.error}
          pendingText="게시글 공개 상태를 변경하는 중입니다."
        />
      </ContentAdminPanel>

      <ContentAdminPanel
        title="신고 처리"
        count={reports.length}
        actions={
          <>
            <label className="content-select-field">
              <ShieldAlert size={16} aria-hidden="true" />
              <span className="sr-only">신고 상태 필터</span>
              <select
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="all">전체 상태</option>
                <option value="reviewing">검토 중</option>
                <option value="closed">처리 완료</option>
              </select>
            </label>
            <PageSizeSelect value={reportPageSize} onChange={setReportPageSize} />
          </>
        }
      >
        <ContentQueryState
          isPending={reportsQuery.isPending}
          error={reportsQuery.error}
          hasData={communityReports.length > 0}
          resource="자유게시판 신고"
          emptyText="조건에 맞는 신고가 없습니다."
          onRetry={() => void reportsQuery.refetch()}
        >
          <DataTable
            columns={reportColumns}
            data={communityReports}
            loading={reportsQuery.isPending}
            loadingText="신고 목록을 불러오는 중입니다."
            emptyText="조건에 맞는 신고가 없습니다."
            alwaysShowPagination
            pageSize={reportPageSize}
            caption="자유게시판 신고 목록"
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateReportMutation.isPending || completeSelectedReportsMutation.isPending}
          error={updateReportMutation.error ?? completeSelectedReportsMutation.error}
          pendingText="신고 처리 상태를 변경하는 중입니다."
        />
      </ContentAdminPanel>

      <Drawer
        open={selectedPostId !== null}
        onClose={() => setSelectedPostId(null)}
        title={selectedPost?.title ?? '게시글 관리'}
        description={selectedPost ? `${activeSource.label} 게시글 #${selectedPost.id}` : undefined}
        className="content-drawer content-drawer--wide"
        footer={
          selectedPost ? (
            <button
              className={selectedPost.isHidden ? 'quiet-button' : 'ui-button ui-button--danger'}
              type="button"
              disabled={togglePostMutation.isPending}
              onClick={() =>
                togglePostMutation.mutate(
                  { id: selectedPost.id, isHidden: !selectedPost.isHidden },
                  { onSuccess: () => setSelectedPostId(null) },
                )
              }
            >
              {selectedPost.isHidden ? (
                <Eye size={15} aria-hidden="true" />
              ) : (
                <EyeOff size={15} aria-hidden="true" />
              )}
              {selectedPost.isHidden ? '게시글 공개' : '게시글 숨김'}
            </button>
          ) : null
        }
      >
        {selectedPost ? (
          <div className="content-detail-stack">
            <dl className="content-detail-list">
              <div>
                <dt>작성자</dt>
                <dd>
                  {selectedPost.isAnonymous ? '익명' : selectedPost.authorName || '알 수 없음'}
                </dd>
              </div>
              <div>
                <dt>등록일</dt>
                <dd>{formatAdminDate(selectedPost.createdAt)}</dd>
              </div>
              <div>
                <dt>조회</dt>
                <dd>{selectedPost.viewCount.toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt>댓글</dt>
                <dd>{selectedPost.commentCount.toLocaleString('ko-KR')}</dd>
              </div>
            </dl>
            <section className="content-detail-section">
              <h3>본문</h3>
              <div className="content-detail-copy">
                {selectedPost.content || '본문이 없습니다.'}
              </div>
            </section>
            <section className="content-detail-section">
              <div className="content-detail-section__header">
                <h3>댓글 {commentsQuery.data?.length ?? 0}건</h3>
                <PageSizeSelect value={commentPageSize} onChange={setCommentPageSize} />
              </div>
              <ContentQueryState
                isPending={commentsQuery.isPending}
                error={commentsQuery.error}
                hasData={(commentsQuery.data?.length ?? 0) > 0}
                resource="댓글 목록"
                emptyText="등록된 댓글이 없습니다."
                onRetry={() => void commentsQuery.refetch()}
              >
                <DataTable
                  columns={commentColumns}
                  data={commentsQuery.data ?? []}
                  loading={commentsQuery.isPending}
                  loadingText="댓글을 불러오는 중입니다."
                  emptyText="등록된 댓글이 없습니다."
                  alwaysShowPagination
                  pageSize={commentPageSize}
                  caption="댓글 관리 목록"
                />
              </ContentQueryState>
              <MutationMessage
                isPending={toggleCommentMutation.isPending}
                error={toggleCommentMutation.error}
                pendingText="댓글 공개 상태를 변경하는 중입니다."
              />
            </section>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={selectedReportId !== null}
        onClose={() => setSelectedReportId(null)}
        title="신고 처리"
        description={
          selectedReport
            ? `${reportTargetLabel[selectedReport.targetType]} #${selectedReport.targetId}`
            : undefined
        }
        className="content-drawer"
        footer={
          selectedReport && selectedReport.status !== 'closed' ? (
            <button
              className="primary-button"
              type="button"
              disabled={updateReportMutation.isPending}
              onClick={() =>
                updateReportMutation.mutate(
                  { id: selectedReport.id, status: 'closed' },
                  { onSuccess: () => setSelectedReportId(null) },
                )
              }
            >
              처리 완료
            </button>
          ) : null
        }
      >
        {selectedReport ? (
          <div className="content-detail-stack">
            <dl className="content-detail-list">
              <div>
                <dt>신고자</dt>
                <dd>{selectedReport.reporterName || '익명'}</dd>
              </div>
              <div>
                <dt>접수일</dt>
                <dd>{formatAdminDate(selectedReport.createdAt)}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>{reportStatusLabel[selectedReport.status] ?? selectedReport.status}</dd>
              </div>
            </dl>
            <section className="content-detail-section">
              <h3>{selectedReport.reason}</h3>
              <div className="content-detail-copy">
                {selectedReport.detail || '추가 상세 내용이 없습니다.'}
              </div>
            </section>
            <MutationMessage
              isPending={updateReportMutation.isPending}
              error={updateReportMutation.error}
              pendingText="신고 처리 상태를 변경하는 중입니다."
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
