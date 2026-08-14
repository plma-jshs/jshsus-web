import { useMemo, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ActivityPrintFloor, ActivityRequestPrintBatch } from '@jshsus/types';
import { CalendarDays, MapPin, PenLine, Printer, UserRound, Users } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  DataTableToolbar,
  ToolbarSelect,
} from '../../components/page/DataTableControls';
import { FilterChips, PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyActivityRequests, printActivityRequests } from './api';
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
import { ActivityPrintPreviewModal } from './ActivityPrintPreviewModal';
import '../../styles/activity-requests.css';

const activityDayFormatter = createKoreanDateFormatter({
  month: '2-digit',
  day: '2-digit',
});

function ActivityPrintMenu({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (floor: ActivityPrintFloor) => void;
}) {
  return (
    <ToolbarSelect<'' | 'all' | 2 | 3 | 4>
      ariaLabel="인쇄할 층 선택"
      value="all"
      disabled={disabled}
      leadingIcon={<Printer size={15} />}
      options={[
        { value: 'all', label: '전체' },
        { value: 2, label: '2층' },
        { value: 3, label: '3층' },
        { value: 4, label: '4층' },
      ]}
      onChange={(value) => {
        onSelect(value as ActivityPrintFloor);
      }}
    />
  );
}

export function ActivityRequestsPage() {
  const navigate = useNavigate({ from: '/activity-requests' });
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
  const page = routeSearch.page ?? 1;
  const pageSize: DataTablePageSize = routeSearch.size ?? 20;
  const [mobileVisibleState, setMobileVisibleState] = useState<{ key: string; count: number }>({
    key: '',
    count: pageSize,
  });
  const [printBatch, setPrintBatch] = useState<ActivityRequestPrintBatch | null>(null);
  const [printMessage, setPrintMessage] = useState('');
  const updateTableSearch = (next: { page?: number; size?: DataTablePageSize }) => {
    void navigate({
      search: (current) => ({
        ...current,
        page: next.page ?? current.page ?? 1,
        size: next.size ?? current.size ?? 20,
      }),
    });
  };
  const printMutation = useMutation({
    mutationFn: (floor: ActivityPrintFloor) => printActivityRequests({ floor }),
    onSuccess: (result) => {
      setPrintBatch(result);
      if (!result.documents.length) {
        setPrintMessage(
          `${result.floor === 'all' ? '전체' : `${result.floor}층`}에 오늘 인쇄할 승인 탐구활동서가 없습니다.`,
        );
        return;
      }
      setPrintMessage('');
    },
    onError: () => setPrintMessage('인쇄 자료를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'),
  });
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
  const mobileVisibleKey = `${endDate}|${filter}|${pageSize}|${query}|${searchField}|${startDate}`;
  const mobileVisibleCount =
    mobileVisibleState.key === mobileVisibleKey ? mobileVisibleState.count : pageSize;
  const mobileVisibleRequests = filtered.slice(0, mobileVisibleCount);
  const openRequest = (requestId: number) => {
    void navigate({
      to: '/activity-requests/$requestId',
      params: { requestId: String(requestId) },
    });
  };
  const handleRequestKeyDown = (event: KeyboardEvent, requestId: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openRequest(requestId);
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('activityRequests')}
      title="탐구활동서"
      width="wide"
      action={
        <div className="activity-page-actions">
          <div className="activity-page-actions__print">
            <ActivityPrintMenu
              disabled={printMutation.isPending}
              onSelect={(floor) => printMutation.mutate(floor)}
            />
          </div>
          <Link
            aria-label="신청하기"
            className="detail-primary-button content-compose-fab"
            title="신청하기"
            to="/activity-requests/new"
          >
            <PenLine size={20} aria-hidden="true" />
          </Link>
        </div>
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
          action={
            <div className="activity-toolbar-actions">
              <ActivityPrintMenu
                disabled={printMutation.isPending}
                onSelect={(floor) => printMutation.mutate(floor)}
              />
              <Link
                className="detail-primary-button data-table-toolbar__create"
                to="/activity-requests/new"
              >
                작성
              </Link>
            </div>
          }
          groupActionWithPageSize
          searchPlaceholder="검색어를 입력하세요"
          searchFieldOptions={[
            { value: 'all', label: '전체' },
            { value: 'activity', label: '내용' },
            { value: 'participants', label: '인원' },
            { value: 'location', label: '장소' },
            { value: 'advisor', label: '지도교사' },
          ]}
          onPageSizeChange={(nextPageSize) => {
            updateTableSearch({ page: 1, size: nextPageSize });
          }}
          onSearch={(nextField, nextQuery) => {
            setSearchField(nextField);
            setQuery(nextQuery);
            updateTableSearch({ page: 1 });
          }}
          extraControls={
            <>
              <FilterChips
                value={filter}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'submitted', label: '승인 대기' },
                  { value: 'approved', label: '승인' },
                  { value: 'rejected', label: '반려' },
                ]}
                label="신청 상태"
                onChange={(nextFilter) => {
                  setFilter(nextFilter as ActivityRequestFilter);
                  updateTableSearch({ page: 1 });
                }}
              />
              <div className="activity-date-range" aria-label="활동 기간">
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
                      updateTableSearch({ page: 1 });
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
                      updateTableSearch({ page: 1 });
                    }}
                  />
                </label>
              </div>
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
                    <tr
                      key={request.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openRequest(request.id)}
                      onKeyDown={(event) => handleRequestKeyDown(event, request.id)}
                    >
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
                        <span>{request.purpose}</span>
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
          <div className="activity-card-list" aria-label="탐구활동서 신청 카드 목록">
            {mobileVisibleRequests.map((request) => {
              const date = activityDayFormatter.format(new Date(request.startsAt));
              const period = formatActivityPeriodLabel(
                koreaDateInput(new Date(request.startsAt)),
                request.startsAt,
                request.endsAt,
                request.activitySlotIds,
              );
              const timeRanges = formatActivityTimeRanges(
                koreaDateInput(new Date(request.startsAt)),
                request.startsAt,
                request.endsAt,
                request.activitySlotIds,
              );
              const participants = formatActivityParticipants(request.participants, request);

              return (
                <article
                  className="activity-request-card"
                  key={request.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openRequest(request.id)}
                  onKeyDown={(event) => handleRequestKeyDown(event, request.id)}
                >
                  <div className="activity-request-card__heading">
                    <span className="activity-request-card__title">{request.purpose}</span>
                    <span className={`activity-status is-${request.status}`}>
                      {activityStatusLabels[request.status]}
                    </span>
                  </div>
                  <div className="activity-request-card__details">
                    <div className="activity-request-card__detail activity-request-card__detail--schedule">
                      <CalendarDays size={15} aria-hidden="true" />
                      <span className="activity-request-card__schedule-text">
                        <strong>
                          {date} ({period})
                        </strong>
                        <em>{timeRanges}</em>
                      </span>
                    </div>
                    <div className="activity-request-card__detail">
                      <MapPin size={15} aria-hidden="true" />
                      <span>{request.location}</span>
                    </div>
                    <div className="activity-request-card__detail">
                      <UserRound size={15} aria-hidden="true" />
                      <span>
                        지도교사: {request.advisorTeacherName ?? request.teacherName ?? '-'}
                      </span>
                    </div>
                    <div className="activity-request-card__detail activity-request-card__detail--participants">
                      <Users size={15} aria-hidden="true" />
                      <span>참여자: {participants}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {filtered.length ? (
          <DataTablePagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onPageSizeChange={(nextSize) => {
              updateTableSearch({ page: 1, size: nextSize });
            }}
            hasMore={mobileVisibleCount < filtered.length}
            onLoadMore={() =>
              setMobileVisibleState({
                key: mobileVisibleKey,
                count: mobileVisibleCount + pageSize,
              })
            }
            onChange={(nextPage) => updateTableSearch({ page: nextPage })}
          />
        ) : null}
      </section>
      {printMessage ? <p className="activity-print-message">{printMessage}</p> : null}
      {printBatch?.documents.length ? (
        <ActivityPrintPreviewModal batch={printBatch} onClose={() => setPrintBatch(null)} />
      ) : null}
    </PageScaffold>
  );
}
