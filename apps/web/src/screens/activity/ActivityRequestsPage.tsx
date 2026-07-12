import type { FormEvent } from 'react';
import { useState } from 'react';
import type { ActivityRequestStatus } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, FilePlus2, MapPin } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import { cancelActivityRequest, createActivityRequest, getMyActivityRequests } from '../../lib/api';
import { createKoreanDateFormatter } from '../../lib/date';

const statusLabels: Record<ActivityRequestStatus, string> = {
  draft: '임시저장',
  submitted: '승인 대기',
  approved: '승인',
  rejected: '반려',
  canceled: '취소',
  completed: '완료',
};

const statusTones: Record<
  ActivityRequestStatus,
  'brand' | 'neutral' | 'positive' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'brand',
  rejected: 'danger',
  canceled: 'neutral',
  completed: 'positive',
};

const activityDateFormatter = createKoreanDateFormatter({
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toDateTimeLocal(date: Date) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
  return next.toISOString().slice(0, 16);
}

const initialActivityTime = Date.now();
const initialActivityForm = {
  location: '',
  startsAt: toDateTimeLocal(new Date(initialActivityTime + 60 * 60 * 1000)),
  endsAt: toDateTimeLocal(new Date(initialActivityTime + 2 * 60 * 60 * 1000)),
  purpose: '',
};

export function ActivityRequestsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialActivityForm);
  const requestsQuery = useQuery({
    queryKey: ['my-activity-requests'],
    queryFn: getMyActivityRequests,
  });
  const createMutation = useMutation({
    mutationFn: createActivityRequest,
    onSuccess: async () => {
      setForm((current) => ({ ...current, location: '', purpose: '' }));
      await queryClient.invalidateQueries({ queryKey: ['my-activity-requests'] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelActivityRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-activity-requests'] });
    },
  });

  const invalidTimeRange = new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (invalidTimeRange) {
      return;
    }

    createMutation.mutate(form);
  };

  const requests = requestsQuery.data ?? [];
  const pendingCount = requests.filter((request) => request.status === 'submitted').length;

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="학교생활"
        title="탐구활동서"
        description="면학 시간 중 다른 장소에서 진행할 탐구활동을 신청하고 승인 상태를 확인하세요."
        stat={{ icon: ClipboardCheck, label: '승인 대기', value: `${pendingCount}건` }}
      />

      <Panel
        title="신규 신청"
        description="활동 장소와 시간을 확인한 뒤 목적을 구체적으로 작성해 주세요."
        icon={FilePlus2}
      >
        <form className="portal-form" onSubmit={handleSubmit}>
          <div className="portal-form__grid portal-form__grid--three">
            <label className="portal-field" htmlFor="activity-location">
              <span className="portal-field__label">활동 장소</span>
              <input
                id="activity-location"
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                maxLength={160}
                placeholder="예: 물리 실험실"
                required
              />
            </label>
            <label className="portal-field" htmlFor="activity-start">
              <span className="portal-field__label">시작 일시</span>
              <input
                id="activity-start"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, startsAt: event.target.value }))
                }
                required
              />
            </label>
            <label className="portal-field" htmlFor="activity-end">
              <span className="portal-field__label">종료 일시</span>
              <input
                id="activity-end"
                type="datetime-local"
                min={form.startsAt}
                value={form.endsAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, endsAt: event.target.value }))
                }
                aria-invalid={invalidTimeRange}
                aria-describedby={invalidTimeRange ? 'activity-time-error' : undefined}
                required
              />
              {invalidTimeRange ? (
                <span className="portal-field__error" id="activity-time-error">
                  종료 일시는 시작 일시보다 늦어야 합니다.
                </span>
              ) : null}
            </label>
            <label className="portal-field portal-field--wide" htmlFor="activity-purpose">
              <span className="portal-field__label">활동 목적</span>
              <textarea
                id="activity-purpose"
                value={form.purpose}
                onChange={(event) =>
                  setForm((current) => ({ ...current, purpose: event.target.value }))
                }
                maxLength={500}
                rows={5}
                placeholder="활동 내용과 면학실 밖에서 진행해야 하는 이유를 적어 주세요."
                required
              />
              <span className="portal-field__hint">최대 500자</span>
            </label>
          </div>
          <div className="portal-actions">
            <button
              className="portal-button portal-button--primary"
              type="submit"
              disabled={createMutation.isPending || invalidTimeRange}
            >
              <FilePlus2 size={16} aria-hidden="true" />
              {createMutation.isPending ? '신청 중…' : '승인 신청'}
            </button>
          </div>
        </form>
        {createMutation.isSuccess ? (
          <p className="action-feedback" role="status">
            탐구활동서가 신청되었습니다.
          </p>
        ) : null}
        {createMutation.isError ? (
          <StateMessage
            kind="error"
            title="탐구활동서를 신청하지 못했습니다."
            description="로그인 상태와 입력 내용을 확인해 주세요."
            compact
          />
        ) : null}
      </Panel>

      <Panel
        title="내 신청 내역"
        description="승인된 신청은 발급번호와 함께 표시됩니다."
        icon={ClipboardCheck}
        action={<span className="portal-panel__count">총 {requests.length}건</span>}
      >
        {requestsQuery.isLoading ? (
          <StateMessage kind="loading" title="신청 내역을 불러오고 있습니다." />
        ) : null}
        {requestsQuery.isError ? (
          <StateMessage
            kind="error"
            title="신청 내역을 불러오지 못했습니다."
            description="로그인 상태를 확인한 뒤 다시 시도해 주세요."
          />
        ) : null}
        {requestsQuery.isSuccess && requests.length === 0 ? (
          <StateMessage
            kind="empty"
            title="신청한 탐구활동서가 없습니다."
            description="새로운 활동이 있다면 위 양식에서 신청해 보세요."
          />
        ) : null}
        {requests.length > 0 ? (
          <div className="item-list">
            {requests.map((request) => {
              const isCanceling =
                cancelMutation.isPending && cancelMutation.variables === request.id;

              return (
                <article className="item-card activity-card" key={request.id}>
                  <div className="item-card__main">
                    <div className="item-card__meta">
                      <StatusBadge tone={statusTones[request.status]}>
                        {statusLabels[request.status]}
                      </StatusBadge>
                      <span className="date-label">
                        <MapPin size={14} aria-hidden="true" />
                        {request.location}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={request.startsAt}>
                        {activityDateFormatter.format(new Date(request.startsAt))}
                      </time>
                      <span aria-hidden="true">–</span>
                      <time dateTime={request.endsAt}>
                        {activityDateFormatter.format(new Date(request.endsAt))}
                      </time>
                    </div>
                    <h3 className="item-card__title">{request.purpose}</h3>
                    {request.issuedNumber ? (
                      <p className="issuance-number">
                        발급번호 <strong>{request.issuedNumber}</strong>
                      </p>
                    ) : null}
                    {request.rejectionReason ? (
                      <p className="item-card__notice item-card__notice--danger">
                        반려 사유: {request.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="item-card__aside">
                    {request.status === 'submitted' ? (
                      <button
                        className="portal-button portal-button--text portal-button--danger"
                        type="button"
                        onClick={() => cancelMutation.mutate(request.id)}
                        disabled={cancelMutation.isPending}
                      >
                        {isCanceling ? '취소 중…' : '신청 취소'}
                      </button>
                    ) : null}
                    {cancelMutation.isError && cancelMutation.variables === request.id ? (
                      <span className="action-feedback action-feedback--error" role="alert">
                        취소하지 못했습니다.
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
