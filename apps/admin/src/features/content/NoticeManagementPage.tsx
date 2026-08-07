import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { NoticeSummary } from '@jshsus/types';
import { ExternalLink, Eye, Paperclip, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  ConfirmDialog,
  PageSizeSelect,
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
import { publicSiteHref } from './publicSiteHref';

export function NoticeManagementPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: true }]);
  const [deleteTarget, setDeleteTarget] = useState<NoticeSummary | null>(null);

  const noticesQuery = useQuery({
    queryKey: ['admin-notices'],
    queryFn: api.notices,
  });

  const refreshNotices = () => queryClient.invalidateQueries({ queryKey: ['admin-notices'] });

  const updateNoticeMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.updateNotice(id, { pinned }),
    onSuccess: async (_, variables) => {
      await refreshNotices();
      showToast({
        title: variables.pinned ? '공지 목록 상단에 고정했습니다.' : '공지 고정을 해제했습니다.',
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '공지 상태를 변경하지 못했습니다.', tone: 'danger' }),
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: api.deleteNotice,
    onSuccess: async () => {
      setDeleteTarget(null);
      await refreshNotices();
      showToast({ title: '공지를 삭제했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '공지를 삭제하지 못했습니다.', tone: 'danger' }),
  });

  const filteredNotices = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return noticesQuery.data ?? [];

    return (noticesQuery.data ?? []).filter((notice) =>
      [notice.title, notice.department]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('ko-KR').includes(keyword)),
    );
  }, [noticesQuery.data, search]);

  const columns = useMemo<ColumnDef<NoticeSummary>[]>(
    () => [
      {
        accessorKey: 'id',
        header: '번호',
        cell: ({ row }) => row.original.publicNumber,
        meta: { align: 'center', width: 72, hideOnMobile: true },
      },
      {
        accessorKey: 'title',
        header: '제목',
        cell: ({ row }) => (
          <div className="content-title-cell">
            <a
              className="content-table-primary"
              href={publicSiteHref(`/notices/${row.original.id}`)}
            >
              {row.original.title}
            </a>
            {row.original.pinned ? (
              <Pin className="content-pinned-icon" size={14} aria-label="공지 고정" />
            ) : null}
          </div>
        ),
        enableSorting: false,
        meta: { minWidth: 260, truncate: true, mobileRole: 'title' },
      },
      {
        accessorKey: 'department',
        header: '작성자',
        enableSorting: false,
        meta: { align: 'left', width: 150 },
      },
      {
        accessorKey: 'publishedAt',
        header: '게시일',
        cell: ({ row }) => formatAdminDate(row.original.publishedAt),
        meta: { align: 'center', width: 132 },
      },
      {
        accessorKey: 'viewCount',
        header: '조회',
        cell: ({ row }) => row.original.viewCount.toLocaleString('ko-KR'),
        meta: { align: 'right', width: 84 },
      },
      {
        id: 'attachment',
        header: '첨부',
        cell: ({ row }) =>
          row.original.attachments?.length ? (
            <span className="content-inline-meta">
              <Paperclip size={14} aria-hidden="true" />
              {row.original.attachments.length}
            </span>
          ) : (
            '-'
          ),
        enableSorting: false,
        meta: { align: 'center', width: 72, hideOnMobile: true },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={
                row.original.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />
              }
              label={row.original.pinned ? '공지 고정 해제' : '공지 고정'}
              mobileLabel={row.original.pinned ? '고정 해제' : '고정'}
              disabled={updateNoticeMutation.isPending}
              onClick={() =>
                updateNoticeMutation.mutate({
                  id: row.original.id,
                  pinned: !row.original.pinned,
                })
              }
            />
            <RowActionButton
              icon={<Trash2 aria-hidden="true" />}
              label="공지 삭제"
              mobileLabel="삭제"
              variant="danger"
              disabled={deleteNoticeMutation.isPending}
              onClick={() => setDeleteTarget(row.original)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 92, mobileRole: 'actions' },
      },
    ],
    [deleteNoticeMutation, updateNoticeMutation],
  );

  return (
    <div className="admin-stack">
      <ContentAdminPanel
        title="공지 관리"
        count={noticesQuery.data?.length ?? 0}
        mobileAction={
          <a className="primary-button notice-mobile-create" href={publicSiteHref('/notices/new')}>
            새 공지
          </a>
        }
        mobileSearch={
          <label className="content-search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">공지 검색</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="제목, 작성자 검색"
            />
          </label>
        }
        actions={
          <div className="content-toolbar">
            <PageSizeSelect value={pageSize} onChange={setPageSize} />
            <a
              className="primary-button notice-desktop-create"
              href={publicSiteHref('/notices/new')}
              target="_blank"
              rel="noreferrer"
            >
              새 공지 <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        }
      >
        <ContentQueryState
          isPending={noticesQuery.isPending}
          error={noticesQuery.error}
          hasData={filteredNotices.length > 0}
          resource="공지 목록"
          emptyText={search ? '검색 조건에 맞는 공지가 없습니다.' : '등록된 공지가 없습니다.'}
          onRetry={() => void noticesQuery.refetch()}
        >
          <DataTable
            columns={columns}
            data={filteredNotices}
            loading={noticesQuery.isPending}
            loadingText="공지 목록을 불러오는 중입니다."
            emptyText={search ? '검색 조건에 맞는 공지가 없습니다.' : '등록된 공지가 없습니다.'}
            pageSize={pageSize}
            sorting={sorting}
            onSortingChange={setSorting}
            alwaysShowPagination
            caption="공지 관리 목록"
            renderMobileRow={(notice) => (
              <article className="notice-mobile-card">
                <header>
                  <div className="content-title-cell">
                    <a
                      className="content-table-primary"
                      href={publicSiteHref(`/notices/${notice.id}`)}
                    >
                      {notice.title}
                    </a>
                    {notice.pinned ? (
                      <Pin className="content-pinned-icon" size={13} aria-label="공지 고정" />
                    ) : null}
                  </div>
                  <RowActions>
                    <RowActionButton
                      icon={
                        notice.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />
                      }
                      label={notice.pinned ? '공지 고정 해제' : '공지 고정'}
                      mobileLabel={notice.pinned ? '고정 해제' : '고정'}
                      disabled={updateNoticeMutation.isPending}
                      onClick={() =>
                        updateNoticeMutation.mutate({ id: notice.id, pinned: !notice.pinned })
                      }
                    />
                    <RowActionButton
                      icon={<Trash2 aria-hidden="true" />}
                      label="공지 삭제"
                      mobileLabel="삭제"
                      variant="danger"
                      disabled={deleteNoticeMutation.isPending}
                      onClick={() => setDeleteTarget(notice)}
                    />
                  </RowActions>
                </header>
                <div className="notice-mobile-card__meta">
                  <span>{notice.department || '-'}</span>
                  <span className="notice-mobile-card__stats">
                    <time>{formatAdminDate(notice.publishedAt)}</time>
                    <span>
                      <Eye size={13} aria-hidden="true" />
                      {notice.viewCount.toLocaleString('ko-KR')}
                    </span>
                  </span>
                </div>
              </article>
            )}
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateNoticeMutation.isPending || deleteNoticeMutation.isPending}
          error={updateNoticeMutation.error ?? deleteNoticeMutation.error}
          pendingText="공지 정보를 변경하는 중입니다."
        />
      </ContentAdminPanel>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="공지 삭제"
        subject={deleteTarget?.title}
        description="삭제한 공지는 복구할 수 없습니다."
        pending={deleteNoticeMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteNoticeMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
