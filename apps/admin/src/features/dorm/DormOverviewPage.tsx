import { useMemo, useState } from 'react';
import { formatDormBedPosition, type DormRoom } from '@jshsus/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { CircleAlert, DoorOpen, Eye } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminSearchField,
  AdminSelect,
  Drawer,
  EmptyState,
  MobileSortSelect,
  RowActionButton,
  RowActions,
  TableSummary,
  TableToolbar,
} from '../../components/ui';
import { DormReportStatusBadge, useDormData } from './dormData';
import './dorm.css';

const now = new Date();

export function DormOverviewPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [semester, setSemester] = useState(now.getMonth() + 1 >= 8 ? 2 : 1);
  const [search, setSearch] = useState('');
  const [dormName, setDormName] = useState<'' | DormRoom['dormName']>('');
  const [grade, setGrade] = useState<number | ''>('');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [selectedRoom, setSelectedRoom] = useState<DormRoom | null>(null);
  const { roomsQuery, reportsQuery, isError } = useDormData({
    year,
    semester,
    search: search.trim() || undefined,
    dormName: dormName || undefined,
    grade: grade || undefined,
  });
  const rooms = roomsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];

  const columns = useMemo<ColumnDef<DormRoom>[]>(
    () => [
      {
        accessorKey: 'dormName',
        header: '생활관',
        enableSorting: false,
        meta: { width: 100, align: 'center', mobileRole: 'subtitle' },
      },
      {
        accessorKey: 'name',
        header: '호실',
        enableSorting: true,
        meta: { width: 90, align: 'center', mobileRole: 'title' },
      },
      {
        accessorKey: 'grade',
        header: '학년',
        cell: ({ getValue }) => `${getValue<number>()}학년`,
        enableSorting: false,
        meta: { width: 86, align: 'center' },
      },
      {
        id: 'residents',
        header: '학생',
        cell: ({ row }) =>
          row.original.residents?.length ? (
            <div className="dorm-resident-summary">
              {row.original.residents.map((resident) => (
                <span key={resident.id}>
                  {resident.studentNo} {resident.studentName}
                </span>
              ))}
            </div>
          ) : (
            <span className="empty-text">미배정</span>
          ),
        enableSorting: false,
      },
      {
        accessorKey: 'openReportCount',
        header: '미처리 민원',
        cell: ({ getValue }) => `${getValue<number>() ?? 0}건`,
        enableSorting: true,
        meta: { width: 110, align: 'right' },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions mobileTitle={`${row.original.dormName} ${row.original.name}`}>
            <RowActionButton
              icon={<Eye aria-hidden="true" />}
              label={`${row.original.dormName} ${row.original.name} 상세 보기`}
              variant="primary"
              onClick={() => setSelectedRoom(row.original)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { width: 64, align: 'center', mobileRole: 'actions' },
      },
    ],
    [],
  );

  const selectedReports = selectedRoom
    ? reports.filter((report) => report.roomId === selectedRoom.id)
    : [];

  return (
    <div className="admin-stack dorm-page">
      {isError ? (
        <section className="admin-panel error">기숙사 정보를 불러오지 못했습니다.</section>
      ) : null}

      <section className="admin-panel dorm-list-panel">
        <TableToolbar
          mobileReset={() => {
            setYear(now.getFullYear());
            setSemester(now.getMonth() + 1 >= 8 ? 2 : 1);
            setSearch('');
            setDormName('');
            setGrade('');
            setSorting([{ id: 'name', desc: false }]);
          }}
          summary={<TableSummary count={rooms.length} suffix="실" loading={roomsQuery.isPending} />}
          mobileSearch={
            <AdminSearchField
              className="dorm-search-field"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="호실 검색"
              aria-label="호실 검색"
              onClear={() => setSearch('')}
            />
          }
          mobileSort={
            <MobileSortSelect
              value={`${sorting[0]?.id ?? 'name'}:${sorting[0]?.desc ? 'desc' : 'asc'}`}
              options={[
                { value: 'name:asc', label: '호실순' },
                { value: 'openReportCount:desc', label: '민원 많은순' },
              ]}
              onChange={(value) => {
                const [id, direction] = value.split(':');
                setSorting([{ id: id ?? 'name', desc: direction === 'desc' }]);
              }}
            />
          }
        >
          <AdminSelect
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="연도"
          >
            {[year - 1, year, year + 1].map((option) => (
              <option key={option} value={option}>
                {option}년
              </option>
            ))}
          </AdminSelect>
          <AdminSelect
            value={semester}
            onChange={(event) => setSemester(Number(event.target.value))}
            aria-label="학기"
          >
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </AdminSelect>
          <AdminSelect
            value={dormName}
            onChange={(event) => setDormName(event.target.value as '' | DormRoom['dormName'])}
            aria-label="생활관"
          >
            <option value="">전체 생활관</option>
            <option value="송죽관">송죽관</option>
            <option value="동백관">동백관</option>
          </AdminSelect>
          <AdminSelect
            value={grade}
            onChange={(event) => setGrade(event.target.value ? Number(event.target.value) : '')}
            aria-label="학년"
          >
            <option value="">전체 학년</option>
            {[1, 2, 3].map((option) => (
              <option key={option} value={option}>
                {option}학년
              </option>
            ))}
          </AdminSelect>
        </TableToolbar>
        <DataTable
          columns={columns}
          data={rooms}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          sorting={sorting}
          onSortingChange={setSorting}
          loading={roomsQuery.isPending}
          emptyText="조건에 맞는 방이 없습니다."
          alwaysShowPagination
          caption="기숙사 방 조회"
          getRowId={(room) => String(room.id)}
          renderMobileRow={(room) => (
            <article className="dorm-mobile-card">
              <header>
                <div>
                  <strong>
                    {room.dormName} {room.name}
                  </strong>
                  <span>
                    {room.grade}학년 · 정원 {room.capacity}명
                  </span>
                </div>
                <RowActions mobileTitle={`${room.dormName} ${room.name}`}>
                  <RowActionButton
                    icon={<Eye aria-hidden="true" />}
                    label={`${room.dormName} ${room.name} 상세 보기`}
                    variant="primary"
                    onClick={() => setSelectedRoom(room)}
                  />
                </RowActions>
              </header>
              <p>
                {room.residents?.length
                  ? room.residents
                      .map((resident) => `${resident.studentNo} ${resident.studentName}`)
                      .join(' · ')
                  : '미배정'}
              </p>
              <footer>미처리 민원 {room.openReportCount ?? 0}건</footer>
            </article>
          )}
        />
      </section>

      <Drawer
        open={Boolean(selectedRoom)}
        onClose={() => setSelectedRoom(null)}
        title={selectedRoom ? `${selectedRoom.dormName} ${selectedRoom.name}` : '방 상세'}
        description={
          selectedRoom ? `${selectedRoom.grade}학년 · 정원 ${selectedRoom.capacity}명` : undefined
        }
      >
        {selectedRoom ? (
          <div className="dorm-drawer-stack">
            <section>
              <h3>배정 학생</h3>
              {selectedRoom.residents?.length ? (
                <ul className="dorm-resident-list">
                  {selectedRoom.residents.map((resident) => (
                    <li key={resident.id}>
                      <span>{formatDormBedPosition(resident.bedPosition)}</span>
                      <strong>
                        {resident.studentNo} {resident.studentName}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="배정된 학생이 없습니다." icon={<DoorOpen size={18} />} />
              )}
            </section>
            <section>
              <h3>민원</h3>
              {selectedReports.length ? (
                <ul className="dorm-report-list">
                  {selectedReports.map((report) => (
                    <li key={report.id}>
                      <div>
                        <strong>
                          {report.studentNo} {report.studentName}
                        </strong>
                        <DormReportStatusBadge status={report.status} />
                      </div>
                      <p>{report.description}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  title="접수된 민원이 없습니다."
                  icon={<CircleAlert size={18} />}
                />
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
