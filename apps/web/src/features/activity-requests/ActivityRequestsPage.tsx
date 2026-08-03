import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  DataTableToolbar,
  ToolbarSelect,
} from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyActivityRequests } from './api';
import {
  formatActivityPeriodLabel,
  formatActivityTimeRanges,
  koreaDateInput,
} from './activitySchedule';
import {
  type ActivityRequestFilter,
  type ActivityRequestSearchField,
  activityStatusLabels,
  formatActivityParticipants,
  matchesActivityFilter,
  matchesActivityQuery,
} from './presentation';
import '../../styles/activity-requests.css';

const activityDayFormatter = createKoreanDateFormatter({
  month: '2-digit',
  day: '2-digit',
});

export function ActivityRequestsPage() {
  const routeSearch = useSearch({ from: '/activity-requests' });
  const requestsQuery = useQuery({
    queryKey: ['activity-requests', 'me'],
    queryFn: getMyActivityRequests,
  });
  const [filter, setFilter] = useState<ActivityRequestFilter>('all');
  const [searchField, setSearchField] = useState<ActivityRequestSearchField>(
    routeSearch.field ?? 'all',
  );
  const [query, setQuery] = useState(routeSearch.q ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DataTablePageSize>(20);
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const filtered = useMemo(
    () =>
      requests.filter(
        (request) =>
          matchesActivityFilter(request, filter) &&
          matchesActivityQuery(request, query, searchField) &&
          (!startDate || koreaDateInput(new Date(request.startsAt)) >= startDate) &&
          (!endDate || koreaDateInput(new Date(request.startsAt)) <= endDate),
      ),
    [endDate, filter, query, requests, searchField, startDate],
  );
  const totalPages = Math.ceil(filtered.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visibleRequests = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('activityRequests')}
      title="탐구활동서"
      width="wide"
      action={
        <Link className="detail-primary-button" to="/activity-requests/new">
          <FilePlus2 size={16} aria-hidden="true" /> 신규 신청
        </Link>
      }
    >
      <section
        className="data-table-section activity-table-section"
        aria-label="탐구활동서 신청 내역"
      >
        <DataTableToolbar
          total={filtered.length}
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          field={searchField}
          query={query}
          searchPlaceholder="검색어를 입력하세요"
          searchFieldOptions={[
            { value: 'all', label: '전체' },
            { value: 'activity', label: '내용' },
            { value: 'participants', label: '인원' },
            { value: 'location', label: '장소' },
            { value: 'advisor', label: '지도교사' },
          ]}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          onSearch={(nextField, nextQuery) => {
            setSearchField(nextField);
            setQuery(nextQuery);
            setPage(1);
          }}
          extraControls={
            <>
              <ToolbarSelect
                ariaLabel="신청 상태"
                value={filter}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'submitted', label: '승인 대기' },
                  { value: 'approved', label: '승인' },
                  { value: 'completed', label: '완료' },
                ]}
                onChange={(nextFilter) => {
                  setFilter(nextFilter as ActivityRequestFilter);
                  setPage(1);
                }}
              />
              <label
                className={`activity-date-control${startDate ? ' has-value' : ''}`}
                data-placeholder="시작일"
                title="활동 시작일"
              >
                <span className="sr-only">시작일</span>
                <input
                  aria-label="활동 시작일"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <span className="activity-date-separator" aria-hidden="true">
                〜
              </span>
              <label
                className={`activity-date-control${endDate ? ' has-value' : ''}`}
                data-placeholder="종료일"
                title="활동 종료일"
              >
                <span className="sr-only">종료일</span>
                <input
                  aria-label="활동 종료일"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </>
          }
        />

        {requestsQuery.isLoading ? (
          <PageState kind="loading" variant="table" title="신청 내역을 불러오는 중입니다." />
        ) : null}
        {requestsQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="신청 내역을 불러오지 못했습니다."
            description="로그인 상태를 확인한 뒤 다시 시도해 주세요."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => requestsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {requestsQuery.isSuccess && !filtered.length ? (
          <PageState
            kind="empty"
            variant="table"
            title={requests.length ? '검색 결과가 없습니다.' : '신청한 탐구활동서가 없습니다.'}
            action={
              requests.length ? (
                <button
                  className="detail-secondary-button"
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                    setStartDate('');
                    setEndDate('');
                    setPage(1);
                  }}
                >
                  검색 초기화
                </button>
              ) : undefined
            }
          />
        ) : null}

        {filtered.length ? (
          <div className="data-table-viewport activity-table-viewport">
            <table className="data-table activity-table">
              <colgroup>
                <col style={{ width: 76 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col">시간</th>
                  <th scope="col">장소</th>
                  <th scope="col">내용</th>
                  <th scope="col">인원</th>
                  <th scope="col">지도교사</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => {
                  const participantCount = Math.max(1, request.participants?.length ?? 0);
                  return (
                    <tr key={request.id}>
                      <td className="activity-table__day" data-label="날짜">
                        <time dateTime={request.startsAt}>
                          {activityDayFormatter.format(new Date(request.startsAt))}
                        </time>
                      </td>
                      <td className="activity-table__period" data-label="시간">
                        <strong>
                          {formatActivityPeriodLabel(
                            koreaDateInput(new Date(request.startsAt)),
                            request.startsAt,
                            request.endsAt,
                            request.activitySlotIds,
                          )}
                        </strong>
                        <span>
                          {formatActivityTimeRanges(
                            koreaDateInput(new Date(request.startsAt)),
                            request.startsAt,
                            request.endsAt,
                            request.activitySlotIds,
                          )}
                        </span>
                      </td>
                      <td className="activity-table__location" data-label="장소">
                        {request.location}
                      </td>
                      <td className="activity-table__purpose" data-label="내용">
                        <Link
                          to="/activity-requests/$requestId"
                          params={{ requestId: String(request.id) }}
                        >
                          {request.purpose}
                        </Link>
                      </td>
                      <td
                        className={`activity-table__participants${
                          participantCount >= 3 ? ' is-dense' : ''
                        }`}
                        data-label="인원"
                      >
                        <span>{formatActivityParticipants(request.participants, request)}</span>
                      </td>
                      <td className="activity-table__advisor" data-label="지도교사">
                        {request.advisorTeacherName ?? request.teacherName ?? '-'}
                      </td>
                      <td data-label="상태">
                        <span className={`activity-status is-${request.status}`}>
                          {activityStatusLabels[request.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {filtered.length ? (
          <DataTablePagination page={safePage} totalPages={totalPages} onChange={setPage} />
        ) : null}
      </section>
    </PageScaffold>
  );
}
