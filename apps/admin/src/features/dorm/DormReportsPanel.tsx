import { useMemo, useState } from 'react';
import type { DormReport, DormReportStatus } from '@jshsus/types';
import { useMutation } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { DataTable } from '../../components/DataTable';
import { Button, Drawer, PageSizeSelect, TableToolbar, useToast } from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import { DormReportStatusBadge, dormReportStatusOptions } from './dormData';

export function DormReportsPanel({
  reports,
  loading,
  refresh,
}: {
  reports: DormReport[];
  loading: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | DormReportStatus>('');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<DormReport | null>(null);
  const [draftStatus, setDraftStatus] = useState<DormReportStatus>('PENDING');
  const [comment, setComment] = useState('');
  const filtered = reports.filter((report) => {
    if (status && report.status !== status) return false;
    const keyword = search.trim().toLocaleLowerCase();
    return (
      !keyword ||
      `${report.dormName} ${report.roomName} ${report.studentNo} ${report.studentName} ${report.description}`
        .toLocaleLowerCase()
        .includes(keyword)
    );
  });
  const openReport = (report: DormReport) => {
    setSelected(report);
    setDraftStatus(report.status);
    setComment(report.comment ?? '');
  };
  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateDormReportStatus(selected!.id, {
        status: draftStatus,
        comment: comment.trim() || undefined,
      }),
    onSuccess: async () => {
      showToast({ title: '민원 처리 내용을 저장했습니다.', tone: 'success' });
      setSelected(null);
      await refresh();
    },
    onError: () => showToast({ title: '민원을 저장하지 못했습니다.', tone: 'danger' }),
  });
  const columns = useMemo<ColumnDef<DormReport>[]>(
    () => [
      {
        accessorKey: 'dormName',
        header: '생활관',
        enableSorting: false,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'roomName',
        header: '호실',
        enableSorting: true,
        meta: { width: 90, align: 'center' },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'studentName',
        header: '신고 학생',
        enableSorting: false,
        meta: { width: 120, align: 'center' },
      },
      {
        accessorKey: 'description',
        header: '내용',
        enableSorting: false,
        meta: { truncate: true },
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ row }) => <DormReportStatusBadge status={row.original.status} />,
        enableSorting: false,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'createdAt',
        header: '접수일',
        cell: ({ getValue }) =>
          new Date(getValue<string>()).toLocaleDateString('ko-KR').replace(/\.$/, ''),
        enableSorting: true,
        meta: { width: 120, align: 'center' },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <Button size="sm" onClick={() => openReport(row.original)}>
            처리
          </Button>
        ),
        enableSorting: false,
        meta: { width: 80, align: 'center' },
      },
    ],
    [],
  );

  return (
    <section className="admin-panel">
      <TableToolbar summary={`총 ${filtered.length}건`}>
        <input
          className="dorm-search-control"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="호실, 학생, 내용 검색"
          aria-label="민원 검색"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as '' | DormReportStatus)}
          aria-label="민원 상태"
        >
          <option value="">전체 상태</option>
          {dormReportStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </TableToolbar>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        pageSize={pageSize}
        sorting={sorting}
        onSortingChange={setSorting}
        alwaysShowPagination
        emptyText="접수된 민원이 없습니다."
        caption="기숙사 민원"
        getRowId={(report) => String(report.id)}
      />
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="민원 처리"
        description={
          selected
            ? `${selected.dormName} ${selected.roomName} · ${selected.studentNo} ${selected.studentName}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setSelected(null)}>취소</Button>
            <Button
              variant="primary"
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              저장
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="dorm-drawer-stack">
            <section>
              <h3>민원 내용</h3>
              <p className="dorm-report-description">{selected.description}</p>
              {selected.imageUrl ? (
                <a className="table-link" href={selected.imageUrl} target="_blank" rel="noreferrer">
                  첨부 이미지 보기
                </a>
              ) : null}
            </section>
            <label>
              상태
              <select
                value={draftStatus}
                onChange={(event) => setDraftStatus(event.target.value as DormReportStatus)}
              >
                {dormReportStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              처리 메모
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={500}
                placeholder="처리 내용을 입력하세요"
              />
            </label>
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
