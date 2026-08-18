import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  BoardCommentSummary,
  BoardPostSummary,
  ContentReportSummary,
  RichTextDocument,
  RichTextNode,
} from '@jshsus/types';
import { Eye, EyeOff, Paperclip, Pin, PinOff, Settings2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminSearchField,
  AdminSelect,
  ConfirmDialog,
  Drawer,
  ResilientImage,
  RowActionButton,
  RowActions,
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

export type CommunityPostVisibility = 'all' | 'published' | 'hidden';

export function filterCommunityPosts(
  posts: readonly BoardPostSummary[],
  visibility: CommunityPostVisibility,
  search: string,
) {
  const keyword = search.trim().toLocaleLowerCase('ko-KR');
  return posts.filter((post) => {
    if (post.status !== 'published') return false;
    if (visibility === 'published' && post.isHidden) return false;
    if (visibility === 'hidden' && !post.isHidden) return false;
    if (!keyword) return true;
    return [post.title, post.authorName, post.content]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase('ko-KR').includes(keyword));
  });
}

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

const RICH_BOARD_PREFIX = 'jshsus-rich-text:v1\n';

function fallbackBoardText(content: string) {
  if (!content.startsWith(RICH_BOARD_PREFIX)) return content;
  try {
    const parsed = JSON.parse(content.slice(RICH_BOARD_PREFIX.length)) as { plainText?: unknown };
    return typeof parsed.plainText === 'string' ? parsed.plainText : '';
  } catch {
    return '';
  }
}

function renderBoardNode(
  node: RichTextNode,
  key: string,
  imageSources: ReadonlyMap<string, string>,
): ReactNode {
  const children = node.content?.map((child, index) =>
    renderBoardNode(child, `${key}-${index}`, imageSources),
  );
  switch (node.type) {
    case 'text':
      return <span key={key}>{node.text}</span>;
    case 'hardBreak':
      return <br key={key} />;
    case 'image': {
      const source = node.attrs?.src;
      if (!source) return null;
      return (
        <ResilientImage
          key={key}
          src={imageSources.get(source) ?? source}
          alt={node.attrs?.alt ?? ''}
        />
      );
    }
    case 'heading':
      return node.attrs?.level === 3 ? (
        <h4 key={key}>{children}</h4>
      ) : (
        <h3 key={key}>{children}</h3>
      );
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'poll':
      return (
        <div key={key} className="content-detail-rich-poll">
          <strong>{node.attrs?.question ?? '투표'}</strong>
          {node.attrs?.options?.length ? (
            <ul>
              {node.attrs.options.map((option) => (
                <li key={option.id}>{option.text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case 'paragraph':
    default:
      return <p key={key}>{children}</p>;
  }
}

function BoardContentPreview({ post }: { post: BoardPostSummary }) {
  const imageSources = new Map<string, string>();
  for (const attachment of post.attachments ?? []) {
    imageSources.set(attachment.inlineUrl, attachment.inlineUrl);
    imageSources.set(attachment.url, attachment.inlineUrl);
  }
  const document = post.contentDoc as RichTextDocument | undefined;
  if (!document) {
    return (
      <div className="content-detail-copy">
        {fallbackBoardText(post.content) || '본문이 없습니다.'}
      </div>
    );
  }
  return (
    <div className="content-detail-copy content-detail-copy--rich">
      {document.content.map((node, index) => renderBoardNode(node, String(index), imageSources))}
    </div>
  );
}

export function CommunityModerationPage({
  sources = [freeBoardSource],
  initialBoardSlug = sources[0]?.slug ?? 'free',
}: CommunityModerationPageProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeBoardSlug, setActiveBoardSlug] = useState(initialBoardSlug);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [hideTarget, setHideTarget] = useState<BoardPostSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardPostSummary | null>(null);
  const [postSearch, setPostSearch] = useState('');
  const [postVisibility, setPostVisibility] = useState<CommunityPostVisibility>('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [postPageSize, setPostPageSize] = useState(20);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [postSorting, setPostSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const activeSource =
    sources.find((source) => source.slug === activeBoardSlug) ?? sources[0] ?? freeBoardSource;

  const postsQuery = useQuery({
    queryKey: ['admin-board-posts', activeSource.slug],
    queryFn: activeSource.loadPosts,
  });
  const { reports, reportsQuery, updateReportMutation } =
    useContentReports(COMMUNITY_REPORT_TARGETS);
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
      setHideTarget(null);
      await refreshPosts();
      showToast({
        title: variables.isHidden ? '게시글을 숨겼습니다.' : '게시글을 공개했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '게시글 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });
  const pinPostMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.updatePostPinned(id, pinned),
    onSuccess: async (_, variables) => {
      await refreshPosts();
      showToast({
        title: variables.pinned ? '게시글을 고정했습니다.' : '게시글 고정을 해제했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '게시글 고정 상태를 변경하지 못했습니다.', tone: 'danger' }),
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
    return filterCommunityPosts(postsQuery.data ?? [], postVisibility, postSearch);
  }, [postSearch, postVisibility, postsQuery.data]);

  const communityReports = useMemo(
    () => reports.filter((report) => reportStatus === 'all' || report.status === reportStatus),
    [reportStatus, reports],
  );
  const selectedPost = (postsQuery.data ?? []).find((post) => post.id === selectedPostId);
  const selectedReport = reports.find((report) => report.id === selectedReportId);

  const postColumns = useMemo<ColumnDef<BoardPostSummary>[]>(
    () => [
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
        meta: { mobileRole: 'title' },
      },
      {
        accessorKey: 'authorName',
        header: '작성자',
        cell: ({ row }) =>
          row.original.isAnonymous ? '익명' : row.original.authorName || '알 수 없음',
        enableSorting: false,
        meta: {
          align: 'left',
          width: 120,
          mobileRole: 'subtitle',
          hideAtCompact: true,
          hideOnMobile: true,
        },
      },
      {
        accessorKey: 'createdAt',
        header: '작성일',
        cell: ({ row }) => formatAdminDate(row.original.createdAt),
        meta: { align: 'center', width: 128 },
      },
      {
        accessorKey: 'viewCount',
        header: '조회',
        cell: ({ row }) => row.original.viewCount.toLocaleString('ko-KR'),
        meta: { align: 'right', width: 84, hideAtCompact: true, hideOnMobile: true },
      },
      {
        accessorKey: 'commentCount',
        header: '댓글',
        cell: ({ row }) => row.original.commentCount.toLocaleString('ko-KR'),
        meta: { align: 'right', width: 84, hideAtCompact: true, hideOnMobile: true },
      },
      {
        id: 'attachments',
        header: '첨부',
        cell: ({ row }) =>
          row.original.attachments?.length ? (
            <span
              className="content-attachment-count"
              title={`첨부 ${row.original.attachments.length}개`}
            >
              <Paperclip size={14} aria-hidden="true" />
              {row.original.attachments.length}
            </span>
          ) : (
            ''
          ),
        enableSorting: false,
        meta: { align: 'center', width: 84, hideAtCompact: true, hideOnMobile: true },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions
            mobileTitle={row.original.title}
            mobileChildren={
              <>
                <RowActionButton
                  icon={
                    row.original.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />
                  }
                  label={row.original.pinned ? '게시글 고정 해제' : '게시글 고정'}
                  mobileLabel={row.original.pinned ? '고정 해제' : '고정'}
                  disabled={pinPostMutation.isPending}
                  onClick={() =>
                    pinPostMutation.mutate({ id: row.original.id, pinned: !row.original.pinned })
                  }
                />
                <RowActionButton
                  icon={
                    row.original.isHidden ? (
                      <Eye aria-hidden="true" />
                    ) : (
                      <EyeOff aria-hidden="true" />
                    )
                  }
                  label={row.original.isHidden ? '게시글 공개' : '게시글 숨김'}
                  mobileLabel={row.original.isHidden ? '공개' : '숨김'}
                  variant={row.original.isHidden ? 'secondary' : 'danger'}
                  disabled={togglePostMutation.isPending}
                  onClick={() => {
                    if (row.original.isHidden) {
                      togglePostMutation.mutate({ id: row.original.id, isHidden: false });
                    } else {
                      setHideTarget(row.original);
                    }
                  }}
                />
              </>
            }
          >
            <RowActionButton
              icon={<Settings2 aria-hidden="true" />}
              label={`${row.original.title} 관리`}
              onClick={() => setSelectedPostId(row.original.id)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64, mobileRole: 'actions' },
      },
    ],
    [activeSource.slug, pinPostMutation, togglePostMutation],
  );

  const reportColumns = useMemo<ColumnDef<ContentReportSummary>[]>(
    () => [
      {
        accessorKey: 'targetType',
        header: '대상',
        cell: ({ row }) =>
          `${reportTargetLabel[row.original.targetType]} #${row.original.targetId}`,
        enableSorting: true,
        meta: { align: 'center', width: 112, mobileRole: 'subtitle' },
      },
      {
        accessorKey: 'createdAt',
        header: '접수일',
        cell: ({ row }) => formatAdminDate(row.original.createdAt),
        meta: { align: 'center', width: 128 },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions mobileTitle={`${reportTargetLabel[row.original.targetType]} 신고`}>
            <RowActionButton
              icon={<Settings2 aria-hidden="true" />}
              label={`${reportTargetLabel[row.original.targetType]} 신고 관리`}
              onClick={() => setSelectedReportId(row.original.id)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64, mobileRole: 'actions' },
      },
    ],
    [],
  );

  return (
    <div className="admin-stack">
      <ContentAdminPanel
        title="자유게시판 관리"
        count={postsQuery.data?.length ?? 0}
        loading={postsQuery.isPending}
        mobileSearch={
          <AdminSearchField
            className="content-search-field"
            aria-label="게시글 검색"
            value={postSearch}
            onChange={(event) => setPostSearch(event.target.value)}
            placeholder="제목, 작성자 검색"
            onClear={() => setPostSearch('')}
          />
        }
        actions={
          <div className="content-toolbar">
            {sources.length > 1 ? (
              <label className="content-select-field">
                <AdminSelect
                  mobileLabel="게시판"
                  aria-label="게시판 선택"
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
                </AdminSelect>
              </label>
            ) : null}
            <label className="content-select-field">
              <AdminSelect
                mobileLabel="상태"
                aria-label="게시글 공개 상태"
                value={postVisibility}
                onChange={(event) => setPostVisibility(event.target.value as typeof postVisibility)}
              >
                <option value="all">전체</option>
                <option value="published">공개</option>
                <option value="hidden">숨김</option>
              </AdminSelect>
            </label>
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
            emptyText={
              postSearch ? '검색 조건에 맞는 게시글이 없습니다.' : '등록된 게시글이 없습니다.'
            }
            alwaysShowPagination
            pageSize={postPageSize}
            onPageSizeChange={setPostPageSize}
            sorting={postSorting}
            onSortingChange={setPostSorting}
            caption={`${activeSource.label} 게시글 관리 목록`}
            renderMobileRow={(post) => (
              <article className="notice-mobile-card">
                <header>
                  <div className="content-title-cell">
                    <a
                      className="content-table-primary"
                      href={publicSiteHref(`/boards/${activeSource.slug}/${post.id}`)}
                    >
                      {post.title}
                    </a>
                    {post.isHidden ? <span className="status-chip danger">숨김</span> : null}
                  </div>
                  <RowActions
                    mobileTitle={post.title}
                    mobileChildren={
                      <>
                        <RowActionButton
                          icon={
                            post.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />
                          }
                          label={post.pinned ? '게시글 고정 해제' : '게시글 고정'}
                          mobileLabel={post.pinned ? '고정 해제' : '고정'}
                          disabled={pinPostMutation.isPending}
                          onClick={() =>
                            pinPostMutation.mutate({ id: post.id, pinned: !post.pinned })
                          }
                        />
                        <RowActionButton
                          icon={
                            post.isHidden ? (
                              <Eye aria-hidden="true" />
                            ) : (
                              <EyeOff aria-hidden="true" />
                            )
                          }
                          label={post.isHidden ? '게시글 공개' : '게시글 숨김'}
                          mobileLabel={post.isHidden ? '공개' : '숨김'}
                          variant={post.isHidden ? 'secondary' : 'danger'}
                          disabled={togglePostMutation.isPending}
                          onClick={() => {
                            if (post.isHidden) {
                              togglePostMutation.mutate({ id: post.id, isHidden: false });
                            } else {
                              setHideTarget(post);
                            }
                          }}
                        />
                      </>
                    }
                  >
                    <RowActionButton
                      icon={<Settings2 aria-hidden="true" />}
                      label={`${post.title} 관리`}
                      mobileLabel="관리"
                      onClick={() => setSelectedPostId(post.id)}
                    />
                  </RowActions>
                </header>
                <div className="notice-mobile-card__meta">
                  <span>{post.isAnonymous ? '익명' : post.authorName || '알 수 없음'}</span>
                  <span className="notice-mobile-card__stats">
                    <time>{formatAdminDate(post.createdAt)}</time>
                    <span>
                      <Eye size={13} aria-hidden="true" />
                      {post.viewCount.toLocaleString('ko-KR')}
                    </span>
                  </span>
                </div>
              </article>
            )}
          />
        </ContentQueryState>
        <MutationMessage
          isPending={togglePostMutation.isPending || pinPostMutation.isPending}
          error={togglePostMutation.error ?? pinPostMutation.error}
          pendingText="게시글 공개 상태를 변경하는 중입니다."
        />
      </ContentAdminPanel>

      <ContentAdminPanel
        title="신고 처리"
        count={reports.length}
        className="community-report-panel"
        actions={
          <>
            <label className="content-select-field">
              <AdminSelect
                mobileLabel="상태"
                aria-label="신고 상태 필터"
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="all">전체</option>
                <option value="reviewing">검토 중</option>
                <option value="closed">처리 완료</option>
              </AdminSelect>
            </label>
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
            emptyText="조건에 맞는 신고가 없습니다."
            alwaysShowPagination
            pageSize={reportPageSize}
            onPageSizeChange={setReportPageSize}
            caption="자유게시판 신고 목록"
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateReportMutation.isPending}
          error={updateReportMutation.error}
          pendingText="신고 처리 상태를 변경하는 중입니다."
        />
      </ContentAdminPanel>

      <Drawer
        open={selectedPostId !== null}
        onClose={() => setSelectedPostId(null)}
        title={selectedPost?.title ?? '게시글 관리'}
        description={
          selectedPost
            ? `${selectedPost.isAnonymous ? '익명' : selectedPost.authorName || '알 수 없음'} · ${formatAdminDate(selectedPost.createdAt)} · 조회 ${selectedPost.viewCount.toLocaleString('ko-KR')} · 댓글 ${selectedPost.commentCount.toLocaleString('ko-KR')}`
            : undefined
        }
        className="content-drawer content-drawer--wide"
        footer={
          selectedPost ? (
            <button
              className={selectedPost.isHidden ? 'quiet-button' : 'ui-button ui-button--danger'}
              type="button"
              disabled={togglePostMutation.isPending}
              onClick={() => {
                if (!selectedPost.isHidden) {
                  setHideTarget(selectedPost);
                  return;
                }
                togglePostMutation.mutate(
                  { id: selectedPost.id, isHidden: false },
                  { onSuccess: () => setSelectedPostId(null) },
                );
              }}
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
            <section className="content-detail-section">
              <h3>본문</h3>
              <BoardContentPreview post={selectedPost} />
            </section>
            <section className="content-detail-section">
              <div className="content-detail-section__header">
                <h3>댓글 {commentsQuery.data?.length ?? 0}건</h3>
              </div>
              <ContentQueryState
                isPending={commentsQuery.isPending}
                error={commentsQuery.error}
                hasData={(commentsQuery.data?.length ?? 0) > 0}
                resource="댓글 목록"
                emptyText="등록된 댓글이 없습니다."
                onRetry={() => void commentsQuery.refetch()}
                showState
              >
                <div className="content-comment-feed" aria-label="댓글 목록">
                  {(commentsQuery.data ?? []).slice(0, 50).map((comment) => (
                    <article className="content-comment-feed__item" key={comment.id}>
                      <div className="content-comment-feed__meta">
                        <span>{comment.authorName || '알 수 없음'}</span>
                        <time dateTime={comment.createdAt}>
                          {formatAdminDate(comment.createdAt)}
                        </time>
                        <button
                          className="content-comment-feed__toggle"
                          type="button"
                          aria-label={comment.isHidden ? '댓글 공개' : '댓글 숨김'}
                          title={comment.isHidden ? '댓글 공개' : '댓글 숨김'}
                          disabled={toggleCommentMutation.isPending}
                          onClick={() =>
                            toggleCommentMutation.mutate({
                              id: comment.id,
                              isHidden: !comment.isHidden,
                            })
                          }
                        >
                          {comment.isHidden ? (
                            <Eye size={16} aria-hidden="true" />
                          ) : (
                            <EyeOff size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      <p className="content-comment-feed__body">{comment.content}</p>
                    </article>
                  ))}
                </div>
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

      <ConfirmDialog
        open={Boolean(hideTarget)}
        title="게시글 숨김"
        subject={hideTarget?.title}
        description="게시글은 삭제하지 않고 사용자 화면에서 숨깁니다. 필요하면 다시 공개할 수 있습니다."
        confirmLabel="숨기기"
        pending={togglePostMutation.isPending}
        onClose={() => setHideTarget(null)}
        onConfirm={() =>
          hideTarget &&
          togglePostMutation.mutate(
            { id: hideTarget.id, isHidden: true },
            { onSuccess: () => setSelectedPostId(null) },
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="게시글 삭제"
        subject={deleteTarget?.title}
        description="게시글을 사용자 화면에서 숨깁니다. 관리자 페이지에는 기록이 남습니다."
        confirmLabel="삭제"
        pending={togglePostMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget &&
          togglePostMutation.mutate(
            { id: deleteTarget.id, isHidden: true },
            { onSuccess: () => setDeleteTarget(null) },
          )
        }
      />

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
                <dt>접수일</dt>
                <dd>{formatAdminDate(selectedReport.createdAt)}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>{reportStatusLabel[selectedReport.status] ?? selectedReport.status}</dd>
              </div>
            </dl>
            <section className="content-detail-section">
              <h3>신고 내용</h3>
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
