import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { AdminAuditLog, AdminAuditLogListQuery } from '@jshsus/types';
import { MoreHorizontal } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  DateRangeField,
  getDateRangePreset,
  Drawer,
  AdminSearchField,
  TableSummary,
  TableToolbar,
} from '../../components/ui';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';
import './audit-logs.css';

function formatAuditDate(value: string) {
  return formatAdminDate(value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="audit-log-detail-trigger" type="button" onClick={onClick}>
      <MoreHorizontal size={18} aria-hidden="true" />
      <span className="sr-only">감사 로그 상세 정보</span>
    </button>
  );
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);
  const query: AdminAuditLogListQuery = {
    page,
    pageSize,
    q: filters.q || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sortBy: (sorting[0]?.id as AdminAuditLogListQuery['sortBy']) ?? 'createdAt',
    sortOrder: sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : 'desc',
  };
  const logsQuery = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => api.auditLogs(query),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<AdminAuditLog>[]>(
    () => [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: '일시',
        cell: ({ getValue }) => formatAuditDate(getValue<string>()),
        meta: { kind: 'dateTime', width: 170 },
      },
      {
        id: 'action',
        accessorKey: 'actionLabel',
        header: '작업',
        enableSorting: false,
        meta: { kind: 'description', minWidth: 220, mobileRole: 'title' },
      },
      {
        id: 'actorName',
        accessorKey: 'actorName',
        header: '수행자',
        meta: { kind: 'person', width: 150, mobileRole: 'subtitle' },
      },
      {
        id: 'targetType',
        accessorKey: 'targetLabel',
        header: '대상',
        meta: { kind: 'category', minWidth: 180 },
      },
      {
        id: 'details',
        header: '상세',
        enableSorting: false,
        cell: ({ row }) => <DetailButton onClick={() => setSelectedLog(row.original)} />,
        meta: { align: 'center', width: 72, hideOnMobile: true },
      },
    ],
    [],
  );

  return (
    <section className="admin-panel audit-log-panel" aria-labelledby="audit-log-title">
      <h2 id="audit-log-title" className="sr-only">
        감사 로그
      </h2>
      <p className="audit-log-total">
        <TableSummary count={logsQuery.data?.total} suffix="건" loading={logsQuery.isPending} />
      </p>
      <TableToolbar
        mobileResetDisabled={
          !filters.q &&
          !filters.from &&
          !filters.to &&
          sorting[0]?.id === 'createdAt' &&
          sorting[0]?.desc === true
        }
        mobileReset={() => {
          setFilters({ q: '', from: '', to: '' });
          setSorting([{ id: 'createdAt', desc: true }]);
          setPage(1);
        }}
        mobileSearch={
          <AdminSearchField
            className="audit-log-search"
            aria-label="감사 로그 검색"
            value={filters.q}
            onChange={(event) => {
              setFilters((current) => ({ ...current, q: event.target.value }));
              setPage(1);
            }}
            placeholder="수행자, 작업, 대상, IP 검색"
            onClear={() => {
              setFilters((current) => ({ ...current, q: '' }));
              setPage(1);
            }}
          />
        }
      >
        <div className="audit-log-filters">
          <DateRangeField
            label="조회 기간"
            from={filters.from}
            to={filters.to}
            onFromChange={(from) => {
              setFilters((current) => ({ ...current, from }));
              setPage(1);
            }}
            onToChange={(to) => {
              setFilters((current) => ({ ...current, to }));
              setPage(1);
            }}
            onPresetChange={(preset) => {
              const range = getDateRangePreset(preset);
              setFilters((current) => ({ ...current, from: range.from, to: range.to }));
              setPage(1);
            }}
          />
        </div>
      </TableToolbar>
      {logsQuery.isError ? (
        <p className="form-error">{describeAdminApiError(logsQuery.error, '감사 로그')}</p>
      ) : null}
      <DataTable
        columns={columns}
        data={logsQuery.data?.items ?? []}
        loading={logsQuery.isPending}
        emptyText="조건에 맞는 감사 로그가 없습니다."
        alwaysShowPagination
        manualSorting
        sorting={sorting}
        onSortingChange={(updater) => {
          setPage(1);
          setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
        }}
        pagination={{
          pageIndex: page - 1,
          pageSize,
          pageCount: logsQuery.data?.totalPages ?? 1,
          totalCount: logsQuery.data?.total ?? 0,
          onPageChange: (pageIndex) => setPage(pageIndex + 1),
          onPageSizeChange: (nextPageSize) => {
            setPage(1);
            setPageSize(nextPageSize);
          },
        }}
        caption="감사 로그 목록"
        renderMobileRow={(log) => (
          <article className="audit-log-mobile-card">
            <button type="button" onClick={() => setSelectedLog(log)}>
              <span className="audit-log-mobile-card__heading">
                <strong>{log.actionLabel}</strong>
                <MoreHorizontal size={18} aria-hidden="true" />
              </span>
              <span>{log.targetLabel}</span>
              <small>
                {log.actorName || '시스템'} · {formatAuditDate(log.createdAt)}
              </small>
            </button>
          </article>
        )}
      />
      <Drawer
        open={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title={selectedLog?.targetLabel ?? '감사 로그 상세'}
        description={selectedLog?.actionLabel}
        className="audit-log-detail-drawer"
      >
        {selectedLog ? (
          <dl className="audit-log-detail-list">
            <div>
              <dt>일시</dt>
              <dd>{formatAuditDate(selectedLog.createdAt)}</dd>
            </div>
            <div>
              <dt>수행자</dt>
              <dd>
                {selectedLog.actorName || '시스템'}
                {selectedLog.actorId ? ` (#${selectedLog.actorId})` : ''}
              </dd>
            </div>
            <div>
              <dt>작업</dt>
              <dd>
                {selectedLog.actionLabel}
                <small>{selectedLog.action}</small>
              </dd>
            </div>
            <div>
              <dt>접속 IP</dt>
              <dd>{selectedLog.ipAddress || ''}</dd>
            </div>
            <div>
              <dt>접속 환경</dt>
              <dd className="audit-log-detail-list__agent">{selectedLog.userAgent || ''}</dd>
            </div>
            <div>
              <dt>로그 ID</dt>
              <dd>#{selectedLog.id}</dd>
            </div>
          </dl>
        ) : null}
      </Drawer>
    </section>
  );
}
