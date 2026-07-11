import type { FormEvent } from 'react';
import { useState } from 'react';
import type { ActivityRequestStatus } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, FilePlus2 } from 'lucide-react';
import { cancelActivityRequest, createActivityRequest, getMyActivityRequests } from '../../lib/api';

const statusLabels: Record<ActivityRequestStatus, string> = {
  draft: '임시저장',
  submitted: '승인 대기',
  approved: '승인',
  rejected: '반려',
  canceled: '취소',
  completed: '완료',
};

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">탐활서</span>
          <h2>탐구활동서 신청</h2>
          <p>
            면학 시간에 면학실이 아닌 다른 장소에서 탐구활동을 해야 할 때 신청하고, 담당 교사의
            승인을 받아 발급번호를 확인합니다.
          </p>
        </div>
        <div className="today-card">
          <FilePlus2 size={20} />
          <span>신규 신청</span>
          <strong>장소·시간·활동 목적 입력</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <FilePlus2 size={19} />
          <h2>신규 신청</h2>
        </div>
        <form className="activity-form" onSubmit={handleSubmit}>
          <label>
            <span>장소</span>
            <input
              value={form.location}
              onChange={(event) =>
                setForm((current) => ({ ...current, location: event.target.value }))
              }
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>시작</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startsAt: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>종료</span>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
              required
            />
          </label>
          <label className="full-field">
            <span>활동 목적</span>
            <textarea
              value={form.purpose}
              onChange={(event) =>
                setForm((current) => ({ ...current, purpose: event.target.value }))
              }
              maxLength={500}
              rows={4}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={createMutation.isPending}>
            신청
          </button>
        </form>
        {createMutation.isError ? <p className="form-error">탐활서 신청에 실패했습니다.</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <ClipboardCheck size={19} />
          <h2>내 탐활서</h2>
        </div>
        {requestsQuery.isLoading ? <p className="empty-text">탐활서를 불러오는 중입니다.</p> : null}
        {requestsQuery.isError ? (
          <p className="empty-text">로그인 후 내 탐활서를 확인할 수 있습니다.</p>
        ) : null}
        {!requestsQuery.isLoading && !requestsQuery.isError ? (
          <div className="list-stack">
            {(requestsQuery.data ?? []).map((request) => (
              <article className="list-row" key={request.id}>
                <div>
                  <span className="row-meta">
                    {request.location} · {new Date(request.startsAt).toLocaleString('ko-KR')}
                  </span>
                  <h3>{request.purpose}</h3>
                  <p>
                    {request.issuedNumber
                      ? `발급번호 ${request.issuedNumber}`
                      : request.rejectionReason || statusLabels[request.status]}
                  </p>
                </div>
                <div className="row-actions">
                  <span className="badge subtle">{statusLabels[request.status]}</span>
                  {request.status === 'submitted' ? (
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => cancelMutation.mutate(request.id)}
                      disabled={cancelMutation.isPending}
                    >
                      취소
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {requestsQuery.data?.length === 0 ? (
              <p className="empty-text">신청한 탐활서가 없습니다.</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
