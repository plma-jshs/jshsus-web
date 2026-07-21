import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { AdminListPanel, PageSizeSelect, TableToolbar } from '../../components/ui';
import { pointsApi, type PointStudentRow } from './pointsApi';
import './points.css';

type StudentSort = 'studentNo' | 'name' | 'meritPoint' | 'penaltyPoint';

function formatSignedPoint(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function PointsOverviewPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('search') ?? '',
  );
  const [grade, setGrade] = useState('');
  const [classNo, setClassNo] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const sort = sorting[0];
  const query = useQuery({
    queryKey: ['point-student-page', page, pageSize, search, grade, classNo, sort?.id, sort?.desc],
    queryFn: () =>
      pointsApi.students({
        page,
        pageSize,
        search: search || undefined,
        grade: grade ? Number(grade) : undefined,
        classNo: classNo ? Number(classNo) : undefined,
        sortBy: (sort?.id as StudentSort | undefined) ?? 'studentNo',
        sortOrder: sort?.desc ? 'desc' : 'asc',
      }),
  });

  const columns = useMemo<ColumnDef<PointStudentRow>[]>(
    () => [
      {
        accessorKey: 'studentNo',
        header: '학번',
        cell: ({ row }) => (
          <a
            className="point-table-link"
            href={`/points/records?search=${encodeURIComponent(String(row.original.studentNo))}`}
          >
            {row.original.studentNo}
          </a>
        ),
        meta: { align: 'center', width: 110 },
      },
      {
        accessorKey: 'name',
        header: '이름',
        cell: ({ row }) => <strong>{row.original.name}</strong>,
        meta: { align: 'center', width: 130 },
      },
      {
        accessorKey: 'meritPoint',
        header: '상점 합계',
        cell: ({ row }) => <strong>{row.original.meritPoint}</strong>,
        meta: { align: 'center', width: 120 },
      },
      {
        accessorKey: 'penaltyPoint',
        header: '벌점 합계',
        cell: ({ row }) => (
          <strong className={row.original.penaltyPoint > 0 ? 'point-value--danger' : ''}>
            {row.original.penaltyPoint}
          </strong>
        ),
        meta: { align: 'center', width: 120 },
      },
      {
        accessorKey: 'currentPoint',
        header: '총합계',
        cell: ({ row }) => (
          <strong
            className={
              row.original.currentPoint < 0
                ? 'point-value--danger'
                : row.original.currentPoint > 0
                  ? 'point-value--positive'
                  : undefined
            }
          >
            {formatSignedPoint(row.original.currentPoint)}
          </strong>
        ),
        meta: { align: 'center', width: 110 },
      },
    ],
    [],
  );

  const resetPage = () => setPage(1);

  return (
    <AdminListPanel
      className="point-panel"
      toolbar={
        <TableToolbar summary={query.data ? `총 ${query.data.total}명` : undefined}>
          <label className="point-filter point-filter--search">
            <span>검색</span>
            <input
              value={search}
              placeholder="학번 또는 이름"
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
            />
          </label>
          <label className="point-filter">
            <span>학년</span>
            <select
              value={grade}
              onChange={(event) => {
                setGrade(event.target.value);
                resetPage();
              }}
            >
              <option value="">전체</option>
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {value}학년
                </option>
              ))}
            </select>
          </label>
          <label className="point-filter">
            <span>반</span>
            <select
              value={classNo}
              onChange={(event) => {
                setClassNo(event.target.value);
                resetPage();
              }}
            >
              <option value="">전체</option>
              {Array.from({ length: 4 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}반
                </option>
              ))}
            </select>
          </label>
          <PageSizeSelect
            value={pageSize}
            onChange={(value) => {
              setPageSize(value);
              resetPage();
            }}
          />
        </TableToolbar>
      }
    >
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        emptyText={query.isError ? query.error.message : '조회된 학생이 없습니다.'}
        sorting={sorting}
        onSortingChange={(updater) => {
          setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
          resetPage();
        }}
        manualSorting
        pagination={{
          pageIndex: page - 1,
          pageSize,
          pageCount: query.data?.totalPages ?? 1,
          totalCount: query.data?.total,
          onPageChange: (nextPage) => setPage(nextPage + 1),
        }}
        alwaysShowPagination
        getRowId={(row) => String(row.id)}
      />
    </AdminListPanel>
  );
}
