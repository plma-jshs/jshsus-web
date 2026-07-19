import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { DataTablePagination } from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createThanksMessage, getThanksChallenge } from './api';
import '../../styles/thanks.css';

const pageSize = 30;

function formatLegacyDateTime(value: string) {
  const [datePart, timePart = ''] = value.split(' ');
  const [year, month, day] = datePart.split('-');
  const [hour, minute] = timePart.split(':');
  if (!year || !month || !day || !hour || !minute) return value;
  return `${year}. ${month}. ${day}. ${hour}:${minute}`;
}

export function ThanksPage() {
  const queryClient = useQueryClient();
  const thanksQuery = useQuery({ queryKey: ['thanks-challenge'], queryFn: getThanksChallenge });
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState<'guide' | 'participate'>('participate');
  const [selectedSchoolNumber, setSelectedSchoolNumber] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const data = thanksQuery.data;
  const messages = data?.messages ?? [];
  const filteredMessages = selectedSchoolNumber
    ? messages.filter((item) => item.schoolNumber === selectedSchoolNumber)
    : messages;

  const createMutation = useMutation({
    mutationFn: createThanksMessage,
    onSuccess: async () => {
      setMessage('');
      setFormError('');
      setSelectedSchoolNumber(null);
      setPage(Math.max(1, Math.ceil(((data?.totalMessages ?? 0) + 1) / pageSize)));
      await queryClient.invalidateQueries({ queryKey: ['thanks-challenge'] });
    },
  });

  const totalPages = Math.ceil(filteredMessages.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visibleMessages = filteredMessages.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSchoolNumber = (schoolNumber: string) => {
    setSelectedSchoolNumber((current) => (current === schoolNumber ? null : schoolNumber));
    setPage(1);
    setActiveTab('participate');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFormError('감사 메시지를 입력해 주세요.');
      return;
    }
    setFormError('');
    createMutation.mutate(trimmedMessage);
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('thanks')}
      title="감사챌린지"
      description="감사 메시지를 남기고 기존 과구리 감사챌린지 기록을 확인하세요."
    >
      <section className="thanks-page" aria-label="감사챌린지">
        <div className="thanks-tabs" role="tablist" aria-label="감사챌린지 보기">
          <button
            type="button"
            role="tab"
            className={activeTab === 'guide' ? 'is-active' : undefined}
            aria-selected={activeTab === 'guide'}
            onClick={() => setActiveTab('guide')}
          >
            안내
          </button>
          <button
            type="button"
            role="tab"
            className={activeTab === 'participate' ? 'is-active' : undefined}
            aria-selected={activeTab === 'participate'}
            onClick={() => setActiveTab('participate')}
          >
            참여
          </button>
        </div>

        {activeTab === 'guide' ? (
          <div className="thanks-guide" role="tabpanel" aria-label="감사챌린지 안내">
            <img src="/images/thanks/rewards.png" alt="감사챌린지 달성 기원 선물 안내" />
            <img src="/images/thanks/examples.png" alt="감사댓글 예시 안내" />
          </div>
        ) : (
          <div className="thanks-layout" role="tabpanel" aria-label="감사챌린지 참여">
            <aside className="thanks-summary" aria-label="학번별 감사 메시지 수">
              <div className="thanks-section-heading">
                <HeartHandshake size={18} aria-hidden="true" />
                <h2>학번별 참여 현황</h2>
              </div>
              {thanksQuery.isSuccess && data?.summary.length ? (
                <ol className="thanks-summary-list">
                  {data.summary.map((item) => (
                    <li
                      className={
                        selectedSchoolNumber === item.schoolNumber ? 'is-selected' : undefined
                      }
                      key={item.schoolNumber}
                    >
                      <button
                        type="button"
                        aria-pressed={selectedSchoolNumber === item.schoolNumber}
                        onClick={() => toggleSchoolNumber(item.schoolNumber)}
                      >
                        <span>{item.schoolNumber}</span>
                        <strong>{item.messageCount.toLocaleString('ko-KR')}</strong>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </aside>

            <div className="thanks-messages">
              <form className="thanks-form" onSubmit={submit} noValidate>
                <label htmlFor="thanks-message">감사 메시지</label>
                <div className="thanks-form__control">
                  <textarea
                    id="thanks-message"
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      if (formError) setFormError('');
                      if (createMutation.isError) createMutation.reset();
                    }}
                    maxLength={1000}
                    aria-invalid={Boolean(formError)}
                    aria-describedby={formError ? 'thanks-message-error' : undefined}
                  />
                  <button
                    className="detail-primary-button"
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? '등록 중' : '등록'}
                  </button>
                </div>
                {formError ? (
                  <p className="thanks-form__error" id="thanks-message-error" role="alert">
                    {formError}
                  </p>
                ) : null}
                {createMutation.isError ? (
                  <p className="thanks-form__error" role="alert">
                    감사 메시지를 등록하지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.
                  </p>
                ) : null}
              </form>

              {thanksQuery.isLoading ? (
                <PageState kind="loading" variant="page" title="감사 메시지를 불러오는 중입니다." />
              ) : null}
              {thanksQuery.isError ? (
                <PageState
                  kind="error"
                  variant="page"
                  title="감사챌린지 데이터를 불러오지 못했습니다."
                  description="로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
                  action={
                    <button
                      className="detail-secondary-button"
                      type="button"
                      onClick={() => thanksQuery.refetch()}
                    >
                      다시 시도
                    </button>
                  }
                />
              ) : null}
              {thanksQuery.isSuccess && !messages.length ? (
                <PageState kind="empty" variant="page" title="등록된 감사 메시지가 없습니다." />
              ) : null}

              {selectedSchoolNumber ? (
                <div className="thanks-filter-state" aria-live="polite">
                  <span>{selectedSchoolNumber} 학번 감사 메시지만 표시 중</span>
                  <button type="button" onClick={() => setSelectedSchoolNumber(null)}>
                    전체 보기
                  </button>
                </div>
              ) : null}

              {visibleMessages.length ? (
                <div className="thanks-message-list" aria-label="감사 메시지 목록">
                  {visibleMessages.map((message) => (
                    <article className="thanks-message-card" key={message.id}>
                      <div className="thanks-message-card__meta">
                        <button
                          type="button"
                          onClick={() => toggleSchoolNumber(message.schoolNumber)}
                        >
                          {message.schoolNumber}
                        </button>
                        <time dateTime={message.submittedAt.replace(' ', 'T')}>
                          {formatLegacyDateTime(message.submittedAt)}
                        </time>
                      </div>
                      <p>{message.message}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {filteredMessages.length ? (
                <DataTablePagination page={safePage} totalPages={totalPages} onChange={setPage} />
              ) : null}
            </div>
          </div>
        )}
      </section>
    </PageScaffold>
  );
}
