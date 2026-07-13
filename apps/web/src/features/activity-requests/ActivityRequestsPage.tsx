import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';
import {
  FilterChips,
  PageScaffold,
  PageState,
  PageToolbar,
  SearchField,
} from '../../components/page/PageScaffold';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyActivityRequests } from './api';
import {
  type ActivityRequestFilter,
  activityStatusLabels,
  matchesActivityFilter,
  matchesActivityQuery,
} from './presentation';
import '../../styles/activity-requests.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const requestDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
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
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const filtered = useMemo(
    () =>
      requests.filter(
        (request) => matchesActivityFilter(request, filter) && matchesActivityQuery(request, query),
      ),
    [filter, query, requests],
  );

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
      breadcrumbs={[{ label: '학교생활' }, { label: '탐구활동서' }]}
      title="탐구활동서"
      description="면학 시간 중 진행할 탐구활동을 신청하고 처리 상태를 확인하세요."
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
            onChange={setFilter}
            label="신청 상태"
            options={filterOptions}
          />
          <SearchField
            value={query}
            onChange={setQuery}
            label="탐구활동서 검색"
            placeholder="활동 목적, 장소, 발급번호 검색"
          />
        </PageToolbar>

        <div className="workflow-table-summary activity-table-summary" aria-live="polite">
          {query.trim() || filter !== 'all'
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
                  }}
                >
                  검색 초기화
                </button>
              ) : (
                <Link className="detail-primary-button" to="/activity-requests/new">
                  첫 신청 작성하기
                </Link>
              )
            }
          />
        ) : null}

        {filtered.length ? (
          <div className="workflow-table-viewport activity-table-viewport">
            <table className="workflow-table activity-table">
              <colgroup>
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 240 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  <th scope="col">활동 목적</th>
                  <th scope="col">신청일</th>
                  <th scope="col">장소</th>
                  <th scope="col">활동 기간</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((request) => (
                  <tr key={request.id}>
                    <td data-label="상태">
                      <span className={`activity-status is-${request.status}`}>
                        {activityStatusLabels[request.status]}
                      </span>
                    </td>
                    <td className="activity-table__purpose" data-label="활동 목적">
                      <Link
                        to="/activity-requests/$requestId"
                        params={{ requestId: String(request.id) }}
                      >
                        {request.purpose}
                      </Link>
                      {request.issuedNumber ? <small>{request.issuedNumber}</small> : null}
                    </td>
                    <td className="activity-table__created" data-label="신청일">
                      {request.createdAt ? (
                        <time dateTime={request.createdAt}>
                          {requestDateFormatter.format(new Date(request.createdAt))}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="activity-table__location" data-label="장소">
                      {request.location}
                    </td>
                    <td className="activity-table__period" data-label="활동 기간">
                      <time dateTime={request.startsAt}>
                        {dateFormatter.format(new Date(request.startsAt))}
                      </time>
                      <span>–</span>
                      <time dateTime={request.endsAt}>
                        {dateFormatter.format(new Date(request.endsAt))}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </PageScaffold>
  );
}
