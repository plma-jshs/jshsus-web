import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PetitionSummary } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MessageSquareText } from 'lucide-react';
import { createPetition, getPetitions, participatePetition } from '../../lib/api';

const statusLabels: Record<PetitionSummary['status'], string> = {
  open: '진행 중',
  awaiting_answer: '답변 대기',
  answered: '답변 완료',
  expired: '만료',
  hidden: '숨김',
};

function defaultEndDate() {
  const next = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
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

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">청원·제안</span>
          <h2>학생 청원</h2>
          <p>학교생활 개선 제안을 등록하고 기준 인원 도달 후 관리자 답변을 확인합니다.</p>
        </div>
        <div className="today-card">
          <MessageSquareText size={20} />
          <span>답변 기준</span>
          <strong>50명 참여</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <FileText size={19} />
          <h2>청원 작성</h2>
        </div>
        <form className="petition-form" onSubmit={handleSubmit}>
          <label>
            <span>제목</span>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              maxLength={255}
              required
            />
          </label>
          <label>
            <span>마감일</span>
            <input
              type="date"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
              required
            />
          </label>
          <label className="full-field">
            <span>내용</span>
            <textarea
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
              rows={5}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={createMutation.isPending}>
            등록
          </button>
        </form>
        {createMutation.isError ? <p className="form-error">청원 등록에 실패했습니다.</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <MessageSquareText size={19} />
          <h2>청원 목록</h2>
        </div>
        {petitionsQuery.isLoading ? <p className="empty-text">청원을 불러오는 중입니다.</p> : null}
        {petitionsQuery.isError ? (
          <p className="empty-text">청원 API 연결을 확인해주세요.</p>
        ) : null}
        <div className="list-stack">
          {(petitionsQuery.data ?? []).map((petition) => (
            <article className="list-row petition-row expanded" key={petition.id}>
              <div>
                <span className="row-meta">
                  참여 {petition.participantCount}/{petition.threshold}명 ·{' '}
                  {new Date(petition.endsAt).toLocaleDateString('ko-KR')}
                </span>
                <h3>{petition.title}</h3>
                <p>{petition.content}</p>
                <progress value={petition.participantCount} max={petition.threshold} />
                {petition.answer ? (
                  <div className="answer-box">
                    <strong>답변</strong>
                    <p>{petition.answer.content}</p>
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <span className="badge subtle">{statusLabels[petition.status]}</span>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => participateMutation.mutate(petition.id)}
                  disabled={participateMutation.isPending || petition.status !== 'open'}
                >
                  참여
                </button>
              </div>
            </article>
          ))}
          {petitionsQuery.data?.length === 0 ? (
            <p className="empty-text">등록된 청원이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
