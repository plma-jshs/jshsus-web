import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { AdminAuditLog, AdminAuditLogListQuery } from '@jshsus/types';
import { Search } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeField, PageSizeSelect, TableToolbar } from '../../components/ui';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import { formatKoreanDate } from '../../shared/lib/date';
import './audit-logs.css';

function formatAuditDate(value: string) {
  return formatKoreanDate(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const columns: ColumnDef<AdminAuditLog>[] = [
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: '생성일시',
    cell: ({ getValue }) => formatAuditDate(getValue<string>()),
    meta: { kind: 'dateTime', width: 170 },
  },
  {
    id: 'actorName',
    accessorKey: 'actorName',
    header: '수행자',
    meta: { kind: 'person', width: 150, mobileRole: 'subtitle' },
  },
  {
    id: 'action',
    accessorKey: 'action',
    header: '작업 내용',
    enableSorting: false,
    meta: { kind: 'description', minWidth: 220, mobileRole: 'title' },
  },
  {
    id: 'targetType',
    accessorKey: 'targetType',
    header: '대상',
    enableSorting: false,
    meta: { kind: 'category', width: 170 },
  },
  {
    id: 'targetId',
    accessorKey: 'targetId',
    header: '대상 ID',
    enableSorting: false,
    cell: ({ getValue }) => getValue<string>() || '-',
    meta: { align: 'center', width: 130, hideOnMobile: true },
  },
];

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
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

  return (
    <section className="admin-panel audit-log-panel">
      <div className="panel-title audit-log-heading">
        <h2>감사 로그</h2>
      </div>
      <TableToolbar
        summary={`총 ${logsQuery.data?.total ?? 0}건`}
        mobileSearch={
          <label className="audit-log-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">감사 로그 검색</span>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => {
                const q = event.target.value;
                setFilters((current) => ({ ...current, q }));
                setPage(1);
              }}
              placeholder="수행자, 작업, 대상 검색"
            />
          </label>
        }
      >
        <div className="audit-log-filters">
          <DateRangeField
            label="생성일"
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
          />
          <PageSizeSelect
            value={pageSize}
            onChange={(nextPageSize) => {
              setPage(1);
              setPageSize(nextPageSize);
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
        loadingText="감사 로그를 불러오는 중입니다."
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
        }}
        caption="감사 로그 목록"
        renderMobileRow={(log) => (
          <article className="audit-log-mobile-card">
            <header>
              <strong>{log.action}</strong>
              <span>{log.actorName || '시스템'}</span>
            </header>
            <p>
              {formatAuditDate(log.createdAt)} · {log.targetType}
              {log.targetId ? ` ${log.targetId}` : ''}
            </p>
          </article>
        )}
      />
    </section>
  );
}
