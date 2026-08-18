import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  AdminSelect,
  AdminSearchField,
  MobileSortSelect,
  TableSummary,
  TableToolbar,
} from '../../components/ui';
import { pointsApi, type PointStudentRow } from './pointsApi';
import './points.css';

type StudentSort = 'studentNo' | 'name' | 'meritPoint' | 'penaltyPoint' | 'currentPoint';

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
  const initialSearch = new URLSearchParams(window.location.search);
  const initialSortBy = initialSearch.get('sortBy');
  const initialSortOrder = initialSearch.get('sortOrder');
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: initialSortBy === 'currentPoint' ? 'currentPoint' : 'studentNo',
      desc: initialSortOrder === 'desc',
    },
  ]);
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
        meta: { kind: 'studentNo', width: 110, mobileRole: 'subtitle' },
      },
      {
        accessorKey: 'name',
        header: '이름',
        meta: { kind: 'person', width: 150, mobileRole: 'title' },
      },
      {
        accessorKey: 'meritPoint',
        header: '상점 합계',
        meta: { kind: 'score', width: 120 },
      },
      {
        accessorKey: 'penaltyPoint',
        header: '벌점 합계',
        cell: ({ row }) => (
          <span className={row.original.penaltyPoint > 0 ? 'point-value--danger' : ''}>
            {row.original.penaltyPoint}
          </span>
        ),
        meta: { kind: 'score', width: 120 },
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
        meta: { kind: 'score', width: 110 },
      },
    ],
    [],
  );

  const resetPage = () => setPage(1);

  return (
    <AdminListPanel
      className="point-panel point-overview-panel"
      toolbar={
        <TableToolbar
          mobileReset={() => {
            setSearch('');
            setGrade('');
            setClassNo('');
            setSorting([{ id: 'studentNo', desc: false }]);
            setPage(1);
          }}
          summary={<TableSummary count={query.data?.total} suffix="명" loading={query.isPending} />}
          mobileSearch={
            <AdminSearchField
              className="point-filter point-filter--search"
              aria-label="학생 검색"
              value={search}
              placeholder="학번 또는 이름"
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              onClear={() => {
                setSearch('');
                resetPage();
              }}
            />
          }
          mobileSort={
            <MobileSortSelect
              value={`${sort?.id ?? 'studentNo'}:${sort?.desc ? 'desc' : 'asc'}`}
              options={[
                { value: 'studentNo:asc', label: '학번순' },
                { value: 'currentPoint:asc', label: '점수 낮은순' },
                { value: 'currentPoint:desc', label: '점수 높은순' },
              ]}
              onChange={(value) => {
                const [id, direction] = value.split(':');
                setSorting([{ id: id ?? 'studentNo', desc: direction === 'desc' }]);
                resetPage();
              }}
            />
          }
        >
          <label className="point-filter">
            <AdminSelect
              aria-label="학년"
              value={grade}
              onChange={(event) => {
                setGrade(event.target.value);
                resetPage();
              }}
            >
              <option value="">전체 학년</option>
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {value}학년
                </option>
              ))}
            </AdminSelect>
          </label>
          <label className="point-filter">
            <AdminSelect
              aria-label="반"
              value={classNo}
              onChange={(event) => {
                setClassNo(event.target.value);
                resetPage();
              }}
            >
              <option value="">전체 반</option>
              {Array.from({ length: 4 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}반
                </option>
              ))}
            </AdminSelect>
          </label>
        </TableToolbar>
      }
    >
      <div className="point-overview-mobile-table-wrap">
        <table className="point-overview-mobile-table">
          <thead>
            <tr>
              <th>학생 정보</th>
              <th>상점</th>
              <th>벌점</th>
              <th>총계</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.items ?? []).map((student) => (
              <tr key={student.id}>
                <td>
                  <strong>{student.name}</strong>
                  <a
                    href={`/points/records?search=${encodeURIComponent(String(student.studentNo))}`}
                  >
                    {student.studentNo}
                  </a>
                </td>
                <td>{student.meritPoint}</td>
                <td className={student.penaltyPoint > 0 ? 'point-value--danger' : undefined}>
                  {student.penaltyPoint}
                </td>
                <td
                  className={
                    student.currentPoint < 0
                      ? 'point-value--danger'
                      : student.currentPoint > 0
                        ? 'point-value--positive'
                        : undefined
                  }
                >
                  <strong>{formatSignedPoint(student.currentPoint)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          onPageSizeChange: (nextPageSize) => {
            setPageSize(nextPageSize);
            resetPage();
          },
        }}
        alwaysShowPagination
        getRowId={(row) => String(row.id)}
      />
    </AdminListPanel>
  );
}
