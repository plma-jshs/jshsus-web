import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  DataTableToolbar,
} from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyActivityRequests } from './api';
import {
  formatActivityPeriodLabel,
  formatActivityTimeRange,
  koreaDateInput,
} from './activitySchedule';
import {
  type ActivityRequestFilter,
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
  const requestsQuery = useQuery({
    queryKey: ['activity-requests', 'me'],
    queryFn: getMyActivityRequests,
  });
  const [filter, setFilter] = useState<ActivityRequestFilter>('all');
  const [query, setQuery] = useState('');
  const [activityDate, setActivityDate] = useState(() => koreaDateInput());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DataTablePageSize>(20);
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const filtered = useMemo(
    () =>
      requests.filter(
        (request) =>
          matchesActivityFilter(request, filter) &&
          matchesActivityQuery(request, query, 'activity_location') &&
          (!activityDate || koreaDateInput(new Date(request.startsAt)) === activityDate),
      ),
    [activityDate, filter, query, requests],
  );
  const totalPages = Math.ceil(filtered.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visibleRequests = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('activityRequests')}
      title="탐구활동서"
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
          key={query}
          total={filtered.length}
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          field="activity_location"
          query={query}
          showSearchField={false}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          onSearch={(_field, nextQuery) => {
            setQuery(nextQuery);
            setPage(1);
          }}
          extraControls={
            <>
              <label>
                <span className="sr-only">신청 상태</span>
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as ActivityRequestFilter);
                    setPage(1);
                  }}
                >
                  <option value="all">전체</option>
                  <option value="submitted">승인 대기</option>
                  <option value="approved">승인</option>
                  <option value="rejected">반려</option>
                  <option value="finished">완료·취소</option>
                </select>
              </label>
              <label className="activity-date-control">
                <span className="sr-only">활동 날짜</span>
                <input
                  type="date"
                  value={activityDate}
                  onChange={(event) => {
                    setActivityDate(event.target.value);
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
                    setActivityDate('');
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
                <col style={{ width: 88 }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">활동일</th>
                  <th scope="col">활동 내용</th>
                  <th scope="col">활동 인원</th>
                  <th scope="col">장소</th>
                  <th scope="col">활동 기간</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="activity-table__day" data-label="활동일">
                      <time dateTime={request.startsAt}>
                        {activityDayFormatter.format(new Date(request.startsAt))}
                      </time>
                    </td>
                    <td className="activity-table__purpose" data-label="활동 내용">
                      <Link
                        to="/activity-requests/$requestId"
                        params={{ requestId: String(request.id) }}
                      >
                        {request.purpose}
                      </Link>
                    </td>
                    <td className="activity-table__participants" data-label="활동 인원">
                      {formatActivityParticipants(request.participants, request)}
                    </td>
                    <td className="activity-table__location" data-label="장소">
                      {request.location}
                    </td>
                    <td className="activity-table__period" data-label="활동 기간">
                      <strong>
                        {formatActivityPeriodLabel(
                          koreaDateInput(new Date(request.startsAt)),
                          request.startsAt,
                          request.endsAt,
                          request.activitySlotIds,
                        )}
                      </strong>
                      <span>{formatActivityTimeRange(request.startsAt, request.endsAt)}</span>
                    </td>
                    <td data-label="상태">
                      <span className={`activity-status is-${request.status}`}>
                        {activityStatusLabels[request.status]}
                      </span>
                    </td>
                  </tr>
                ))}
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
