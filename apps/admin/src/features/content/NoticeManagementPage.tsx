import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { NoticeSummary } from '@jshsus/types';
import { ExternalLink, Paperclip, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { PageSizeSelect, RowActionButton, RowActions, useToast } from '../../components/ui';
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
        cell: ({ row }) => row.original.publicNumber ?? row.original.id,
        meta: { align: 'center', width: 72 },
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
        meta: { minWidth: 260, truncate: true },
      },
      {
        accessorKey: 'department',
        header: '작성자',
        enableSorting: false,
        meta: { align: 'center', width: 150 },
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
        meta: { align: 'center', width: 84 },
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
        meta: { align: 'center', width: 72 },
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
              variant="danger"
              disabled={deleteNoticeMutation.isPending}
              onClick={() => {
                if (window.confirm(`‘${row.original.title}’ 공지를 삭제하시겠습니까?`)) {
                  deleteNoticeMutation.mutate(row.original.id);
                }
              }}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 92 },
      },
    ],
    [deleteNoticeMutation, updateNoticeMutation],
  );

  return (
    <div className="admin-stack">
      <ContentAdminPanel
        title="공지 관리"
        count={noticesQuery.data?.length ?? 0}
        actions={
          <div className="content-toolbar">
            <label className="content-search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">공지 검색</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="제목, 작성자 검색"
              />
            </label>
            <PageSizeSelect value={pageSize} onChange={setPageSize} />
            <a
              className="primary-button"
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
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateNoticeMutation.isPending || deleteNoticeMutation.isPending}
          error={updateNoticeMutation.error ?? deleteNoticeMutation.error}
          pendingText="공지 정보를 변경하는 중입니다."
        />
      </ContentAdminPanel>
    </div>
  );
}
