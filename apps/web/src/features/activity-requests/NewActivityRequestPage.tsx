import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { PageScaffold } from '../../components/page/PageScaffold';
import { createActivityRequest } from './api';
import {
  type ActivityRequestForm,
  getActivityDurationLabel,
  validateActivityRequestForm,
} from './presentation';
import '../../styles/activity-requests.css';

function toDateTimeLocal(date: Date) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
  return next.toISOString().slice(0, 16);
}

function initialForm(): ActivityRequestForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    location: '',
    startsAt: toDateTimeLocal(start),
    endsAt: toDateTimeLocal(end),
    purpose: '',
  };
}

export function NewActivityRequestPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ActivityRequestForm>(initialForm);
  const [minimumStart] = useState(() => toDateTimeLocal(new Date()));
  const [touched, setTouched] = useState<Partial<Record<keyof ActivityRequestForm, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo(() => validateActivityRequestForm(form), [form]);
  const duration = getActivityDurationLabel(form.startsAt, form.endsAt);
  const mutation = useMutation({
    mutationFn: () =>
      createActivityRequest({
        ...form,
        location: form.location.trim(),
        purpose: form.purpose.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      }),
    onSuccess: async () => {
      setSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: ['activity-requests', 'me'] });
    },
  });

  const updateField = <K extends keyof ActivityRequestForm>(
    field: K,
    value: ActivityRequestForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (mutation.isError) mutation.reset();
  };
  const showError = (field: keyof ActivityRequestForm) =>
    Boolean(errors[field]) && (attempted || touched[field]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    mutation.mutate();
  };

  if (submitted && mutation.data) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '탐구활동서', to: '/activity-requests' }, { label: '신규 신청' }]}
        title="탐구활동서가 제출되었습니다"
        description="담당 교사가 신청 내용을 검토하면 상태가 변경됩니다."
        width="reading"
        variant="form"
      >
        <section className="activity-submit-success" role="status">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div>
            <strong>{form.purpose}</strong>
            <p>
              {form.location} · {duration ?? '활동 시간 확인 필요'}
            </p>
          </div>
          <Link
            className="detail-primary-button"
            to="/activity-requests/$requestId"
            params={{ requestId: String(mutation.data.request.id) }}
          >
            신청 확인하기
          </Link>
        </section>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={[{ label: '탐구활동서', to: '/activity-requests' }, { label: '신규 신청' }]}
      title="탐구활동서 신청"
      description="활동 목적과 시간, 장소를 정확하게 입력해 주세요."
      width="reading"
      variant="form"
    >
      <form className="activity-form" onSubmit={submit} noValidate>
        <section className="activity-form-section" aria-labelledby="activity-purpose-title">
          <div className="activity-form-section__heading">
            <span>1</span>
            <div>
              <h2 id="activity-purpose-title">활동 정보</h2>
              <p>활동 내용과 면학실 밖에서 진행해야 하는 이유를 작성해 주세요.</p>
            </div>
          </div>
          <div className="activity-form-field">
            <label htmlFor="activity-purpose">활동 목적</label>
            <textarea
              id="activity-purpose"
              value={form.purpose}
              onChange={(event) => updateField('purpose', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, purpose: true }))}
              maxLength={500}
              rows={7}
              placeholder="예: 물리 탐구 보고서 작성을 위해 실험 장비를 사용하려고 합니다."
              aria-invalid={showError('purpose')}
              aria-describedby={showError('purpose') ? 'activity-purpose-error' : undefined}
              autoFocus
            />
            <div className="activity-form-field__meta">
              {showError('purpose') ? (
                <span className="activity-form-field__error" id="activity-purpose-error">
                  {errors.purpose}
                </span>
              ) : (
                <span>10자 이상 구체적으로 작성해 주세요.</span>
              )}
              <span>{form.purpose.length} / 500</span>
            </div>
          </div>
        </section>

        <section className="activity-form-section" aria-labelledby="activity-schedule-title">
          <div className="activity-form-section__heading">
            <span>2</span>
            <div>
              <h2 id="activity-schedule-title">시간과 장소</h2>
              <p>이동 시간을 포함해 실제 활동이 이루어지는 기간을 선택해 주세요.</p>
            </div>
          </div>
          <div className="activity-form-field">
            <label htmlFor="activity-location">활동 장소</label>
            <input
              id="activity-location"
              value={form.location}
              onChange={(event) => updateField('location', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, location: true }))}
              maxLength={160}
              placeholder="예: 물리 실험실"
              aria-invalid={showError('location')}
              aria-describedby={showError('location') ? 'activity-location-error' : undefined}
            />
            {showError('location') ? (
              <span className="activity-form-field__error" id="activity-location-error">
                {errors.location}
              </span>
            ) : null}
          </div>
          <div className="activity-form-time-grid">
            <div className="activity-form-field">
              <label htmlFor="activity-start">시작 일시</label>
              <input
                id="activity-start"
                type="datetime-local"
                value={form.startsAt}
                min={minimumStart}
                onChange={(event) => updateField('startsAt', event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, startsAt: true }))}
                aria-invalid={showError('startsAt')}
                aria-describedby={showError('startsAt') ? 'activity-start-error' : undefined}
              />
              {showError('startsAt') ? (
                <span className="activity-form-field__error" id="activity-start-error">
                  {errors.startsAt}
                </span>
              ) : null}
            </div>
            <div className="activity-form-field">
              <label htmlFor="activity-end">종료 일시</label>
              <input
                id="activity-end"
                type="datetime-local"
                value={form.endsAt}
                min={form.startsAt}
                onChange={(event) => updateField('endsAt', event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, endsAt: true }))}
                aria-invalid={showError('endsAt')}
                aria-describedby={showError('endsAt') ? 'activity-end-error' : undefined}
              />
              {showError('endsAt') ? (
                <span className="activity-form-field__error" id="activity-end-error">
                  {errors.endsAt}
                </span>
              ) : null}
            </div>
          </div>
          <div className={`activity-duration-summary${duration ? '' : ' is-invalid'}`}>
            <span>예상 활동 시간</span>
            <strong>{duration ?? '시간을 다시 확인해 주세요'}</strong>
          </div>
        </section>

        <p className="activity-form-notice">
          제출 즉시 담당 교사의 검토가 시작됩니다. 승인 전에는 활동 장소와 시간을 다시 확인해
          주세요.
        </p>

        {mutation.isError ? (
          <div className="activity-form-error" role="alert">
            <strong>신청서를 제출하지 못했습니다.</strong>
            <span>입력 내용과 로그인 상태를 확인한 뒤 다시 시도해 주세요.</span>
          </div>
        ) : null}

        <div className="activity-form-actions">
          <Link className="detail-secondary-button" to="/activity-requests">
            <ArrowLeft size={16} aria-hidden="true" /> 취소
          </Link>
          <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
            <Send size={16} aria-hidden="true" />
            {mutation.isPending ? '제출 중' : '신청서 제출'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
