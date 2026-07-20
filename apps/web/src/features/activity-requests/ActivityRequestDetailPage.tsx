import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ContentMoreMenu } from '../../components/page/ContentMoreMenu';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { parsePositiveRouteId } from '../../shared/lib/route';
import { getSession } from '../auth/api';
import { deleteActivityRequest, getActivityRequest } from './api';
import { activityStatusLabels, getActivityDurationLabel } from './presentation';
import '../../styles/activity-requests.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function DetailError({
  status,
  returnTo,
  onRetry,
}: {
  status?: number;
  returnTo: string;
  onRetry: () => void;
}) {
  if (status === 401 || status === 403) {
    return (
      <PageState
        kind="error"
        variant="page"
        title="신청 내역을 확인할 권한이 없습니다."
        description="로그인 상태를 확인해 주세요."
        action={
          <Link className="detail-primary-button" to="/login" search={{ returnTo }}>
            로그인하기
          </Link>
        }
      />
    );
  }
  if (status === 404) {
    return (
      <PageState
        kind="empty"
        variant="page"
        title="신청 내역을 찾을 수 없습니다."
        description="존재하지 않거나 본인의 신청 내역이 아닐 수 있습니다."
        action={
          <Link className="detail-secondary-button" to="/activity-requests">
            신청 목록으로
          </Link>
        }
      />
    );
  }
  return (
    <PageState
      kind="error"
      variant="page"
      title="신청 내역을 불러오지 못했습니다."
      description="잠시 후 다시 시도해 주세요."
      action={
        <button className="detail-secondary-button" type="button" onClick={onRetry}>
          다시 시도
        </button>
      }
    />
  );
}

export function ActivityRequestDetailPage() {
  const { requestId } = useParams({ from: '/activity-requests/$requestId' });
  const parsedId = parsePositiveRouteId(requestId);
  const id = parsedId ?? 0;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const requestQuery = useQuery({
    queryKey: ['activity-requests', 'detail', id],
    queryFn: () => getActivityRequest(id),
    enabled: parsedId !== null,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteActivityRequest(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-requests', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['activity-requests', 'detail', id] }),
      ]);
      await navigate({ to: '/activity-requests' });
    },
  });

  if (parsedId === null) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('activityRequests')}
        title="탐구활동서"
        width="reading"
        variant="document"
      >
        <DetailError status={404} returnTo="/activity-requests" onRetry={() => undefined} />
      </PageScaffold>
    );
  }

  if (requestQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('activityRequests')}
        title="탐구활동서"
        width="reading"
        variant="document"
      >
        <PageState kind="loading" variant="page" title="신청서를 불러오는 중입니다." />
      </PageScaffold>
    );
  }

  if (requestQuery.isError || !requestQuery.data) {
    const status = requestQuery.error instanceof ApiError ? requestQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('activityRequests')}
        title="탐구활동서"
        width="reading"
        variant="document"
      >
        <DetailError
          status={status}
          returnTo={`/activity-requests/${requestId}`}
          onRetry={() => requestQuery.refetch()}
        />
      </PageScaffold>
    );
  }

  const request = requestQuery.data;
  const canEdit =
    sessionQuery.data?.isLogined === true &&
    Number(sessionQuery.data.stuid ?? sessionQuery.data.identifier) === request.studentNo;
  const duration = getActivityDurationLabel(request.startsAt, request.endsAt);
  return (
    <PageScaffold
      breadcrumbs={detailBreadcrumbs('activityRequests')}
      title={request.purpose}
      width="reading"
      variant="document"
      meta={
        <>
          <span className={`activity-status is-${request.status}`}>
            {activityStatusLabels[request.status]}
          </span>
          <span>발급번호 #{request.id}</span>
        </>
      }
    >
      <article className="activity-document">
        {request.status === 'submitted' && canEdit ? (
          <div className="content-card-action-anchor">
            <ContentMoreMenu
              deleteDisabled={deleteMutation.isPending}
              deleteLabel={deleteMutation.isPending ? '삭제 중' : '삭제'}
              onDelete={() => {
                if (window.confirm('이 탐구활동서 신청을 삭제할까요?')) deleteMutation.mutate();
              }}
              onEdit={() =>
                void navigate({
                  to: '/activity-requests/$requestId/edit',
                  params: { requestId: String(request.id) },
                })
              }
            />
          </div>
        ) : null}
        <section aria-labelledby="activity-information-title">
          <div className="activity-document__heading">
            <h2 id="activity-information-title">신청 정보</h2>
            <span>
              {request.studentNo} {request.studentName} · 대표
            </span>
          </div>
          <dl className="activity-definition-list">
            <div>
              <dt>활동 장소</dt>
              <dd>{request.location}</dd>
            </div>
            <div>
              <dt>참여 학생</dt>
              <dd>
                {request.participants.map((student, index) => (
                  <span key={student.studentId}>
                    {student.studentNo} {student.studentName}
                    {student.isRepresentative ? ' · 대표' : ''}
                    {index < request.participants.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>시작 일시</dt>
              <dd>
                <time dateTime={request.startsAt}>
                  {dateFormatter.format(new Date(request.startsAt))}
                </time>
              </dd>
            </div>
            <div>
              <dt>종료 일시</dt>
              <dd>
                <time dateTime={request.endsAt}>
                  {dateFormatter.format(new Date(request.endsAt))}
                </time>
                {duration ? <small>총 {duration}</small> : null}
              </dd>
            </div>
            <div>
              <dt>담당 교사</dt>
              <dd>{request.advisorTeacherName ?? '배정 전'}</dd>
            </div>
            {request.reviewerName ? (
              <div>
                <dt>승인자</dt>
                <dd>{request.reviewerName}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {request.rejectionReason ? (
          <section className="activity-rejection" aria-labelledby="activity-rejection-title">
            <h2 id="activity-rejection-title">반려 사유</h2>
            <p>{request.rejectionReason}</p>
          </section>
        ) : null}

        {deleteMutation.isError ? (
          <p className="activity-mutation-error" role="alert">
            신청을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : null}
      </article>

      <div className="activity-bottom-actions">
        <Link className="detail-secondary-button" to="/activity-requests">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
