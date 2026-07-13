import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Check, Copy } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { parsePositiveRouteId } from '../../shared/lib/route';
import { cancelActivityRequest, getActivityRequest } from './api';
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestQuery = useQuery({
    queryKey: ['activity-requests', 'detail', id],
    queryFn: () => getActivityRequest(id),
    enabled: parsedId !== null,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelActivityRequest(id),
    onSuccess: async () => {
      setConfirmCancel(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-requests', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['activity-requests', 'detail', id] }),
      ]);
    },
  });

  if (parsedId === null) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '탐구활동서', to: '/activity-requests' }]}
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
        breadcrumbs={[{ label: '탐구활동서', to: '/activity-requests' }]}
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
        breadcrumbs={[{ label: '탐구활동서', to: '/activity-requests' }]}
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
  const duration = getActivityDurationLabel(request.startsAt, request.endsAt);
  const copyIssuedNumber = async () => {
    if (!request.issuedNumber) return;
    try {
      await navigator.clipboard.writeText(request.issuedNumber);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <PageScaffold
      breadcrumbs={[{ label: '학교생활' }, { label: '탐구활동서', to: '/activity-requests' }]}
      title={request.purpose}
      width="reading"
      variant="document"
      meta={
        <>
          <span className={`activity-status is-${request.status}`}>
            {activityStatusLabels[request.status]}
          </span>
          <span>신청번호 #{request.id}</span>
        </>
      }
    >
      <article className="activity-document">
        <section aria-labelledby="activity-information-title">
          <div className="activity-document__heading">
            <h2 id="activity-information-title">신청 정보</h2>
            <span>{request.studentName}</span>
          </div>
          <dl className="activity-definition-list">
            <div>
              <dt>활동 장소</dt>
              <dd>{request.location}</dd>
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
              <dd>{request.teacherName ?? '배정 전'}</dd>
            </div>
            {request.issuedNumber ? (
              <div>
                <dt>발급번호</dt>
                <dd className="activity-issued-number">
                  <code>{request.issuedNumber}</code>
                  <button type="button" onClick={copyIssuedNumber} aria-label="발급번호 복사">
                    {copied ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                    {copied ? '복사됨' : '복사'}
                  </button>
                </dd>
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

        {request.status === 'submitted' ? (
          <section className="activity-cancel-section" aria-label="신청 취소">
            {confirmCancel ? (
              <div className="activity-cancel-confirm" role="group" aria-label="신청 취소 확인">
                <div>
                  <strong>이 신청을 취소할까요?</strong>
                  <span>취소한 신청은 다시 승인받을 수 없습니다.</span>
                </div>
                <div>
                  <button
                    className="detail-secondary-button"
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelMutation.isPending}
                  >
                    계속 유지
                  </button>
                  <button
                    className="activity-danger-button"
                    type="button"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? '취소 처리 중' : '신청 취소'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="activity-text-danger"
                type="button"
                onClick={() => setConfirmCancel(true)}
              >
                <Ban size={15} aria-hidden="true" /> 신청 취소
              </button>
            )}
            {cancelMutation.isError ? (
              <p className="activity-mutation-error" role="alert">
                신청을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
            ) : null}
          </section>
        ) : null}

        {cancelMutation.isSuccess ? (
          <p className="activity-mutation-success" role="status">
            신청이 취소되었습니다.
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
