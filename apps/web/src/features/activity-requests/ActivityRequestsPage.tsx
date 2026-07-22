import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';
import { DataTablePagination } from '../../components/page/DataTableControls';
import {
  FilterChips,
  PageScaffold,
  PageState,
  PageToolbar,
  SearchField,
} from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyActivityRequests } from './api';
import { koreaDateInput } from './activitySchedule';
import {
  type ActivityRequestFilter,
  activityStatusLabels,
  matchesActivityFilter,
  matchesActivityQuery,
} from './presentation';
import '../../styles/activity-requests.css';

const activityDayFormatter = createKoreanDateFormatter({
  month: '2-digit',
  day: '2-digit',
});
const activityTimeFormatter = createKoreanDateFormatter({
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getParticipantCount(request: { participants?: unknown[] }) {
  return request.participants?.length ?? 1;
}

export function ActivityRequestsPage() {
  const requestsQuery = useQuery({
    queryKey: ['activity-requests', 'me'],
    queryFn: getMyActivityRequests,
  });
  const [filter, setFilter] = useState<ActivityRequestFilter>('all');
  const [query, setQuery] = useState('');
  const [activityDate, setActivityDate] = useState(() => koreaDateInput());
  const [page, setPage] = useState(1);
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const filtered = useMemo(
    () =>
      requests.filter(
        (request) =>
          matchesActivityFilter(request, filter) &&
          matchesActivityQuery(request, query) &&
          (!activityDate || koreaDateInput(new Date(request.startsAt)) === activityDate),
      ),
    [activityDate, filter, query, requests],
  );
  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visibleRequests = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filterOptions: Array<{ value: ActivityRequestFilter; label: string; count: number }> = [
    { value: 'all', label: '전체', count: requests.length },
    {
      value: 'submitted',
      label: '승인 대기',
      count: requests.filter((item) => item.status === 'submitted').length,
    },
    {
      value: 'approved',
      label: '승인',
      count: requests.filter((item) => item.status === 'approved').length,
    },
    {
      value: 'rejected',
      label: '반려',
      count: requests.filter((item) => item.status === 'rejected').length,
    },
    {
      value: 'finished',
      label: '완료·취소',
      count: requests.filter((item) => item.status === 'completed' || item.status === 'canceled')
        .length,
    },
  ];

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
        className="workflow-table-section activity-table-section"
        aria-label="탐구활동서 신청 내역"
      >
        <PageToolbar>
          <FilterChips
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            label="신청 상태"
            options={filterOptions}
          />
          <div className="activity-list-controls">
            <div className="activity-date-control">
              <label className="sr-only" htmlFor="activity-date-filter">
                활동 날짜
              </label>
              <input
                id="activity-date-filter"
                type="date"
                value={activityDate}
                onChange={(event) => {
                  setActivityDate(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <SearchField
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              label="탐구활동서 검색"
              placeholder="활동 내용, 장소 검색"
            />
          </div>
        </PageToolbar>

        <div className="workflow-table-summary activity-table-summary" aria-live="polite">
          {query.trim() || filter !== 'all' || activityDate
            ? `검색 결과 ${filtered.length}건`
            : `총 ${requests.length}건`}
        </div>

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
          <div className="workflow-table-viewport activity-table-viewport">
            <table className="workflow-table activity-table">
              <colgroup>
                <col style={{ width: 88 }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 132 }} />
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
                      {getParticipantCount(request)}명
                    </td>
                    <td className="activity-table__location" data-label="장소">
                      {request.location}
                    </td>
                    <td className="activity-table__period" data-label="활동 기간">
                      <time dateTime={request.startsAt}>
                        {activityTimeFormatter.format(new Date(request.startsAt))}
                      </time>
                      <time dateTime={request.endsAt}>
                        {activityTimeFormatter.format(new Date(request.endsAt))}
                      </time>
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
