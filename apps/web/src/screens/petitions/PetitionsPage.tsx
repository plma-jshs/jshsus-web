import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PetitionSummary } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileText, MessageSquareText, UsersRound } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import { createPetition, getPetitions, participatePetition } from '../../lib/api';

const statusLabels: Record<PetitionSummary['status'], string> = {
  open: '진행 중',
  awaiting_answer: '답변 대기',
  answered: '답변 완료',
  expired: '마감',
  hidden: '비공개',
};

const statusTones: Record<PetitionSummary['status'], 'brand' | 'neutral' | 'positive' | 'warning'> =
  {
    open: 'brand',
    awaiting_answer: 'warning',
    answered: 'positive',
    expired: 'neutral',
    hidden: 'neutral',
  };

const petitionDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function defaultEndDate() {
  const next = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function todayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

export function PetitionsPage() {
  const queryClient = useQueryClient();
  const petitionsQuery = useQuery({ queryKey: ['petitions'], queryFn: getPetitions });
  const [form, setForm] = useState({
    title: '',
    content: '',
    endsAt: defaultEndDate(),
  });
  const createMutation = useMutation({
    mutationFn: createPetition,
    onSuccess: async () => {
      setForm({ title: '', content: '', endsAt: defaultEndDate() });
      await queryClient.invalidateQueries({ queryKey: ['petitions'] });
    },
  });
  const participateMutation = useMutation({
    mutationFn: participatePetition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['petitions'] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({
      title: form.title,
      content: form.content,
      endsAt: new Date(`${form.endsAt}T23:59:59`).toISOString(),
    });
  };

  const petitions = petitionsQuery.data ?? [];

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="커뮤니티"
        title="청원·제안"
        description="학교생활을 더 나은 방향으로 바꿀 의견을 제안하고 함께 참여하세요."
        stat={{ icon: UsersRound, label: '답변 기준', value: '50명 참여' }}
      />

      <Panel
        title="새 청원 작성"
        description="문제 상황과 원하는 개선 방향을 구체적으로 작성해 주세요."
        icon={FileText}
      >
        <form className="portal-form" onSubmit={handleSubmit}>
          <div className="portal-form__grid">
            <label className="portal-field" htmlFor="petition-title">
              <span className="portal-field__label">제목</span>
              <input
                id="petition-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                maxLength={255}
                placeholder="제안의 핵심을 간결하게 적어 주세요."
                required
              />
            </label>
            <label className="portal-field" htmlFor="petition-end-date">
              <span className="portal-field__label">참여 마감일</span>
              <input
                id="petition-end-date"
                type="date"
                min={todayDate()}
                value={form.endsAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, endsAt: event.target.value }))
                }
                required
              />
            </label>
            <label className="portal-field portal-field--wide" htmlFor="petition-content">
              <span className="portal-field__label">제안 내용</span>
              <textarea
                id="petition-content"
                value={form.content}
                onChange={(event) =>
                  setForm((current) => ({ ...current, content: event.target.value }))
                }
                rows={6}
                placeholder="현재 상황, 개선이 필요한 이유, 제안 내용을 차례로 작성해 주세요."
                required
              />
            </label>
          </div>
          <div className="portal-actions">
            <button
              className="portal-button portal-button--primary"
              type="submit"
              disabled={createMutation.isPending}
            >
              <FileText size={16} aria-hidden="true" />
              {createMutation.isPending ? '등록 중…' : '청원 등록'}
            </button>
          </div>
        </form>
        {createMutation.isSuccess ? (
          <p className="action-feedback" role="status">
            청원이 등록되었습니다.
          </p>
        ) : null}
        {createMutation.isError ? (
          <StateMessage
            kind="error"
            title="청원을 등록하지 못했습니다."
            description="로그인 상태와 입력 내용을 확인해 주세요."
            compact
          />
        ) : null}
      </Panel>

      <Panel
        title="청원 목록"
        description="진행 중인 제안에 참여하거나 답변이 완료된 내용을 확인할 수 있습니다."
        icon={MessageSquareText}
        action={<span className="portal-panel__count">총 {petitions.length}건</span>}
      >
        {petitionsQuery.isLoading ? (
          <StateMessage kind="loading" title="청원을 불러오고 있습니다." />
        ) : null}
        {petitionsQuery.isError ? (
          <StateMessage
            kind="error"
            title="청원을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        ) : null}
        {petitionsQuery.isSuccess && petitions.length === 0 ? (
          <StateMessage
            kind="empty"
            title="등록된 청원이 없습니다."
            description="학교생활을 위한 첫 제안을 남겨 보세요."
          />
        ) : null}
        {petitions.length > 0 ? (
          <div className="item-list">
            {petitions.map((petition) => {
              const isParticipating =
                participateMutation.isPending && participateMutation.variables === petition.id;

              return (
                <article className="item-card petition-card" key={petition.id}>
                  <div className="item-card__main">
                    <div className="item-card__meta">
                      <StatusBadge tone={statusTones[petition.status]}>
                        {statusLabels[petition.status]}
                      </StatusBadge>
                      <span>
                        참여 {petition.participantCount.toLocaleString('ko-KR')}명 /{' '}
                        {petition.threshold.toLocaleString('ko-KR')}명
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="date-label">
                        <CalendarClock size={14} aria-hidden="true" />
                        <time dateTime={petition.endsAt}>
                          {petitionDateFormatter.format(new Date(petition.endsAt))} 마감
                        </time>
                      </span>
                    </div>
                    <h3 className="item-card__title">{petition.title}</h3>
                    <p className="item-card__content">{petition.content}</p>

                    <div className="progress-block">
                      <div className="progress-block__label">
                        <span>참여 현황</span>
                        <strong>
                          {Math.min(
                            100,
                            Math.round((petition.participantCount / petition.threshold) * 100),
                          )}
                          %
                        </strong>
                      </div>
                      <progress
                        className="progress-bar"
                        value={petition.participantCount}
                        max={petition.threshold}
                        aria-label={`${petition.title} 참여 현황`}
                      />
                    </div>

                    {petition.answer ? (
                      <div className="answer-box">
                        <div className="answer-box__header">
                          <strong>공식 답변</strong>
                          <time dateTime={petition.answer.answeredAt}>
                            {petitionDateFormatter.format(new Date(petition.answer.answeredAt))}
                          </time>
                        </div>
                        <p>{petition.answer.content}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="item-card__aside">
                    <button
                      className="portal-button portal-button--secondary"
                      type="button"
                      onClick={() => participateMutation.mutate(petition.id)}
                      disabled={participateMutation.isPending || petition.status !== 'open'}
                    >
                      <UsersRound size={15} aria-hidden="true" />
                      {isParticipating
                        ? '처리 중…'
                        : petition.status === 'open'
                          ? '청원 참여'
                          : '참여 마감'}
                    </button>
                    {participateMutation.isError &&
                    participateMutation.variables === petition.id ? (
                      <span className="action-feedback action-feedback--error" role="alert">
                        참여를 처리하지 못했습니다.
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
