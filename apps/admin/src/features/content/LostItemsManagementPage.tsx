import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContentReportSummary, LostItemSummary } from '@jshsus/types';
import { PackageSearch, Search, Settings2, ShieldAlert, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { Drawer, PageSizeSelect, RowActionButton, RowActions, useToast } from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import {
  ContentAdminPanel,
  ContentQueryState,
  MutationMessage,
  formatAdminDate,
} from './components/ContentAdminPanel';
import { useContentReports } from './hooks/useContentReports';
import { publicSiteHref } from './publicSiteHref';

const lostItemStatusLabel: Record<LostItemSummary['status'], string> = {
  PROCESSING: '처리 중',
  RETURNED: '반환 완료',
};

const reportStatusLabel: Record<string, string> = {
  open: '접수',
  reviewing: '검토 중',
  closed: '처리 완료',
  rejected: '반려',
};

const LOST_ITEM_REPORT_TARGETS = ['lost_item'] as const;

export function LostItemsManagementPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reportStatusFilter, setReportStatusFilter] = useState('all');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedItemStatus, setSelectedItemStatus] =
    useState<LostItemSummary['status']>('PROCESSING');
  const [itemPageSize, setItemPageSize] = useState(20);
  const [reportPageSize, setReportPageSize] = useState(20);

  const lostItemsQuery = useQuery({
    queryKey: ['admin-lost-items'],
    queryFn: api.lostItems,
  });
  const {
    reports: lostItemReports,
    reportsQuery,
    updateReportMutation,
  } = useContentReports(LOST_ITEM_REPORT_TARGETS);

  const updateLostStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LostItemSummary['status'] }) =>
      api.updateLostItemStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-lost-items'] });
      showToast({ title: '분실물 처리 상태를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '분실물 처리 상태를 저장하지 못했습니다.', tone: 'danger' }),
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
  const selectedReport = lostItemReports.find((report) => report.id === selectedReportId);
  const filteredReports = useMemo(
    () =>
      lostItemReports.filter(
        (report) => reportStatusFilter === 'all' || report.status === reportStatusFilter,
      ),
    [lostItemReports, reportStatusFilter],
  );

  const itemColumns = useMemo<ColumnDef<LostItemSummary>[]>(
    () => [
      {
        id: 'number',
        header: '번호',
        cell: ({ row }) => (lostItemsQuery.data?.length ?? 0) - row.index,
        enableSorting: false,
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
    [lostItemsQuery.data?.length],
  );

  const reportColumns = useMemo<ColumnDef<ContentReportSummary>[]>(
    () => [
      {
        accessorKey: 'targetId',
        header: '분실물',
        cell: ({ row }) => `#${row.original.targetId}`,
        meta: { align: 'center', width: 88 },
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
              label={`분실물 #${row.original.targetId} 신고 관리`}
              onClick={() => setSelectedReportId(row.original.id)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { align: 'center', width: 64 },
      },
    ],
    [],
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
              <PackageSearch size={16} aria-hidden="true" />
              <span className="sr-only">등록 구분</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">분실·습득 전체</option>
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
                <option value="all">전체 상태</option>
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
            caption="분실물 관리 목록"
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateLostStatusMutation.isPending || deleteLostItemMutation.isPending}
          error={updateLostStatusMutation.error ?? deleteLostItemMutation.error}
          pendingText={
            deleteLostItemMutation.isPending
              ? '분실물 게시물을 삭제하는 중입니다.'
              : '분실물 처리 상태를 변경하는 중입니다.'
          }
        />
      </ContentAdminPanel>

      <ContentAdminPanel
        title="분실물 신고"
        count={lostItemReports.length}
        actions={
          <>
            <label className="content-select-field">
              <ShieldAlert size={16} aria-hidden="true" />
              <span className="sr-only">신고 상태 필터</span>
              <select
                value={reportStatusFilter}
                onChange={(event) => setReportStatusFilter(event.target.value)}
              >
                <option value="all">전체 상태</option>
                <option value="open">접수</option>
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
          hasData={filteredReports.length > 0}
          resource="분실물 신고"
          emptyText="접수된 분실물 신고가 없습니다."
          onRetry={() => void reportsQuery.refetch()}
        >
          <DataTable
            columns={reportColumns}
            data={filteredReports}
            loading={reportsQuery.isPending}
            loadingText="신고 목록을 불러오는 중입니다."
            emptyText="접수된 분실물 신고가 없습니다."
            alwaysShowPagination
            pageSize={reportPageSize}
            caption="분실물 신고 목록"
          />
        </ContentQueryState>
        <MutationMessage
          isPending={updateReportMutation.isPending}
          error={updateReportMutation.error}
          pendingText="신고 처리 상태를 변경하는 중입니다."
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
                  if (window.confirm('이 분실물 게시물을 삭제할까요?')) {
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

      <Drawer
        open={selectedReportId !== null}
        onClose={() => setSelectedReportId(null)}
        title="분실물 신고 처리"
        description={selectedReport ? `분실물 #${selectedReport.targetId}` : undefined}
        className="content-drawer"
        footer={
          selectedReport && selectedReport.status !== 'closed' ? (
            <>
              {selectedReport.status === 'open' ? (
                <button
                  className="quiet-button"
                  type="button"
                  disabled={updateReportMutation.isPending}
                  onClick={() =>
                    updateReportMutation.mutate(
                      { id: selectedReport.id, status: 'reviewing' },
                      { onSuccess: () => setSelectedReportId(null) },
                    )
                  }
                >
                  검토 시작
                </button>
              ) : null}
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
            </>
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
