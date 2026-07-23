import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { LostItemSummary } from '@jshsus/types';
import { Search, Settings2, Trash2 } from 'lucide-react';
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
import { publicSiteHref } from './publicSiteHref';

const lostItemStatusLabel: Record<LostItemSummary['status'], string> = {
  PROCESSING: '찾는 중',
  RETURNED: '반환 완료',
};

export function LostItemsManagementPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItemStatus, setSelectedItemStatus] =
    useState<LostItemSummary['status']>('PROCESSING');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(() => new Set());
  const [itemPageSize, setItemPageSize] = useState(20);
  const [itemSorting, setItemSorting] = useState<SortingState>([{ id: 'id', desc: true }]);

  const lostItemsQuery = useQuery({
    queryKey: ['admin-lost-items'],
    queryFn: api.lostItems,
  });

  const updateLostStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LostItemSummary['status'] }) =>
      api.updateLostItemStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-lost-items'] });
      showToast({ title: '분실물 처리 상태를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '분실물 처리 상태를 저장하지 못했습니다.', tone: 'danger' }),
  });
  const completeSelectedItemsMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => api.updateLostItemStatus(id, 'RETURNED'))),
    onSuccess: async (_, ids) => {
      setSelectedItemIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['admin-lost-items'] });
      showToast({ title: `분실물 ${ids.length}건을 반환 완료로 변경했습니다.`, tone: 'success' });
    },
    onError: () => showToast({ title: '선택한 분실물을 처리하지 못했습니다.', tone: 'danger' }),
  });
  const deleteLostItemMutation = useMutation({
    mutationFn: (id: number) => api.deleteLostItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-lost-items'] });
      setSelectedItemId(null);
      showToast({ title: '분실물 게시물을 삭제했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '분실물 게시물을 삭제하지 못했습니다.', tone: 'danger' }),
  });
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR');

    return (lostItemsQuery.data ?? []).filter((item) => {
      const matchesSearch =
        !keyword ||
        [item.itemName, item.location, item.description, item.authorName]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase('ko-KR').includes(keyword));
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [lostItemsQuery.data, search, statusFilter, typeFilter]);

  const selectedItem = (lostItemsQuery.data ?? []).find((item) => item.id === selectedItemId);
  const visibleItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const allVisibleItemsSelected =
    visibleItemIds.length > 0 && visibleItemIds.every((id) => selectedItemIds.has(id));
  const someVisibleItemsSelected = visibleItemIds.some((id) => selectedItemIds.has(id));
  const selectedCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;

  const toggleVisibleItems = useCallback(
    (checked: boolean) => {
      setSelectedItemIds(checked ? new Set(visibleItemIds) : new Set());
    },
    [visibleItemIds],
  );

  const toggleItem = useCallback((id: number, checked: boolean) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const completeSelectedItems = useCallback(() => {
    const ids = visibleItemIds.filter((id) => selectedItemIds.has(id));
    if (ids.length === 0 || completeSelectedItemsMutation.isPending) return;
    if (!window.confirm(`선택한 분실물 ${ids.length}건을 반환 완료로 변경하시겠습니까?`)) {
      return;
    }
    completeSelectedItemsMutation.mutate(ids);
  }, [completeSelectedItemsMutation, selectedItemIds, visibleItemIds]);

  const itemColumns = useMemo<ColumnDef<LostItemSummary>[]>(
    () => [
      {
        id: 'selection',
        header: () => (
          <TableSelectionCheckbox
            label="분실물 전체 선택"
            checked={allVisibleItemsSelected}
            indeterminate={someVisibleItemsSelected && !allVisibleItemsSelected}
            disabled={visibleItemIds.length === 0 || completeSelectedItemsMutation.isPending}
            onChange={toggleVisibleItems}
          />
        ),
        cell: ({ row }) => (
          <TableSelectionCheckbox
            label={`${row.original.itemName} 선택`}
            checked={selectedItemIds.has(row.original.id)}
            disabled={completeSelectedItemsMutation.isPending}
            onChange={(checked) => toggleItem(row.original.id, checked)}
          />
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
      {
        accessorKey: 'id',
        header: () => (
          <SelectedRowsHeaderAction
            selectedCount={selectedCount}
            defaultLabel="번호"
            deleteLabel="반환 완료"
            variant="primary"
            loading={completeSelectedItemsMutation.isPending}
            loadingLabel="처리 중"
            onDelete={completeSelectedItems}
          />
        ),
        enableSorting: selectedCount === 0,
        cell: ({ row }) => row.original.id,
        meta: { align: 'center', width: 72 },
      },
      {
        accessorKey: 'type',
        header: '구분',
        cell: ({ row }) => (
          <span className={`status-chip ${row.original.type === 'lost' ? 'warning' : 'success'}`}>
            {row.original.type === 'lost' ? '분실' : '습득'}
          </span>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 88 },
      },
      {
        accessorKey: 'itemName',
        header: '물품',
        cell: ({ row }) => (
          <a
            className="content-table-primary"
            href={publicSiteHref(`/lost-items/${row.original.id}`)}
          >
            {row.original.itemName}
          </a>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'location',
        header: '장소',
        cell: ({ row }) => row.original.location || '미입력',
        enableSorting: false,
      },
      {
        accessorKey: 'authorName',
        header: '등록자',
        cell: ({ row }) => row.original.authorName || '알 수 없음',
        enableSorting: false,
        meta: { align: 'center', width: 116 },
      },
      {
        accessorKey: 'occurredAt',
        header: '발생일',
        cell: ({ row }) => formatAdminDate(row.original.occurredAt),
        meta: { align: 'center', width: 128 },
      },
      {
        id: 'attachments',
        header: '사진',
        cell: ({ row }) =>
          row.original.attachments?.length
            ? `${row.original.attachments.length.toLocaleString('ko-KR')}개`
            : '-',
        enableSorting: false,
        meta: { align: 'center', width: 72 },
      },
      {
        accessorKey: 'status',
        header: '처리 상태',
        cell: ({ row }) => (
          <span
            className={`status-chip ${row.original.status === 'RETURNED' ? 'success' : 'warning'}`}
          >
            {lostItemStatusLabel[row.original.status]}
          </span>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 108 },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={<Settings2 aria-hidden="true" />}
              label={`${row.original.itemName} 관리`}
              onClick={() => {
                setSelectedItemStatus(row.original.status);
                setSelectedItemId(row.original.id);
              }}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
    ],
    [
      allVisibleItemsSelected,
      completeSelectedItems,
      completeSelectedItemsMutation.isPending,
      selectedCount,
      selectedItemIds,
      someVisibleItemsSelected,
      toggleItem,
      toggleVisibleItems,
      visibleItemIds.length,
    ],
  );

  return (
    <div className="admin-stack">
      <ContentAdminPanel
        title="분실물 관리"
        count={lostItemsQuery.data?.length ?? 0}
        actions={
          <div className="content-toolbar">
            <label className="content-search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">분실물 검색</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="물품, 장소, 등록자 검색"
              />
            </label>
            <label className="content-select-field">
              <span className="sr-only">등록 구분</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">전체</option>
                <option value="lost">분실</option>
                <option value="found">습득</option>
              </select>
            </label>
            <label className="content-select-field">
              <span className="sr-only">처리 상태</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">전체</option>
                {Object.entries(lostItemStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <PageSizeSelect value={itemPageSize} onChange={setItemPageSize} />
          </div>
        }
      >
        <ContentQueryState
          isPending={lostItemsQuery.isPending}
          error={lostItemsQuery.error}
          hasData={filteredItems.length > 0}
          resource="분실물 목록"
          emptyText="조건에 맞는 분실물 게시물이 없습니다."
          onRetry={() => void lostItemsQuery.refetch()}
        >
          <DataTable
            columns={itemColumns}
            data={filteredItems}
            loading={lostItemsQuery.isPending}
            loadingText="분실물 목록을 불러오는 중입니다."
            emptyText="조건에 맞는 분실물 게시물이 없습니다."
            alwaysShowPagination
            pageSize={itemPageSize}
            sorting={itemSorting}
            onSortingChange={setItemSorting}
            caption="분실물 관리 목록"
          />
        </ContentQueryState>
        <MutationMessage
          isPending={
            updateLostStatusMutation.isPending ||
            deleteLostItemMutation.isPending ||
            completeSelectedItemsMutation.isPending
          }
          error={
            updateLostStatusMutation.error ??
            deleteLostItemMutation.error ??
            completeSelectedItemsMutation.error
          }
          pendingText={
            deleteLostItemMutation.isPending
              ? '분실물 게시물을 삭제하는 중입니다.'
              : '분실물 처리 상태를 변경하는 중입니다.'
          }
        />
      </ContentAdminPanel>

      <Drawer
        open={selectedItemId !== null}
        onClose={() => setSelectedItemId(null)}
        title={selectedItem?.itemName ?? '분실물 관리'}
        description={
          selectedItem
            ? `${selectedItem.type === 'lost' ? '분실' : '습득'} 게시물 #${selectedItem.id}`
            : undefined
        }
        className="content-drawer"
        footer={
          selectedItem ? (
            <>
              <button
                className="content-danger-button"
                type="button"
                disabled={deleteLostItemMutation.isPending || updateLostStatusMutation.isPending}
                onClick={() => {
                  if (window.confirm('이 분실물 게시물을 삭제하시겠습니까?')) {
                    deleteLostItemMutation.mutate(selectedItem.id);
                  }
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> 삭제
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={
                  deleteLostItemMutation.isPending ||
                  updateLostStatusMutation.isPending ||
                  selectedItemStatus === selectedItem.status
                }
                onClick={() =>
                  updateLostStatusMutation.mutate(
                    { id: selectedItem.id, status: selectedItemStatus },
                    { onSuccess: () => setSelectedItemId(null) },
                  )
                }
              >
                저장
              </button>
            </>
          ) : null
        }
      >
        {selectedItem ? (
          <div className="content-detail-stack">
            <dl className="content-detail-list">
              <div>
                <dt>구분</dt>
                <dd>{selectedItem.type === 'lost' ? '분실' : '습득'}</dd>
              </div>
              <div>
                <dt>등록자</dt>
                <dd>{selectedItem.authorName || '알 수 없음'}</dd>
              </div>
              <div>
                <dt>발생일</dt>
                <dd>{formatAdminDate(selectedItem.occurredAt)}</dd>
              </div>
              <div>
                <dt>장소</dt>
                <dd>{selectedItem.location || '미입력'}</dd>
              </div>
            </dl>
            <section className="content-detail-section">
              <h3>상세 내용</h3>
              <div className="content-detail-copy">
                {selectedItem.description || '상세 내용이 없습니다.'}
              </div>
            </section>
            {selectedItem.attachments?.length ? (
              <section className="content-detail-section">
                <h3>첨부 파일</h3>
                <ul className="content-attachment-list">
                  {selectedItem.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={attachment.inlineUrl} target="_blank" rel="noreferrer">
                        {attachment.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <label className="content-drawer-field">
              <span>처리 상태</span>
              <select
                value={selectedItemStatus}
                onChange={(event) =>
                  setSelectedItemStatus(event.target.value as LostItemSummary['status'])
                }
              >
                {Object.entries(lostItemStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <MutationMessage
              isPending={updateLostStatusMutation.isPending || deleteLostItemMutation.isPending}
              error={updateLostStatusMutation.error ?? deleteLostItemMutation.error}
              pendingText={
                deleteLostItemMutation.isPending
                  ? '분실물 게시물을 삭제하는 중입니다.'
                  : '분실물 처리 상태를 변경하는 중입니다.'
              }
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
