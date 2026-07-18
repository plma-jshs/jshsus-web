import type { PetitionDetail } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react';
import { RichTextContent } from '../../components/editor/RichTextEditor';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { authActionRequiresLogin } from '../auth/action-access';
import { getSession } from '../auth/api';
import { parsePositiveRouteId } from '../../shared/lib/route';
import { getPetition, participatePetition } from './api';
import { getPetitionProgress, petitionStatusLabels } from './presentation';
import '../../styles/petitions.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function PetitionDetailError({ status, onRetry }: { status?: number; onRetry: () => void }) {
  if (status === 404) {
    return (
      <PageState
        kind="empty"
        variant="page"
        title="청원·제안을 찾을 수 없습니다."
        description="삭제되었거나 공개되지 않은 청원·제안입니다."
        action={
          <Link className="detail-secondary-button" to="/petitions">
            청원·제안 목록으로
          </Link>
        }
      />
    );
  }
  if (status === 401 || status === 403) {
    return (
      <PageState
        kind="error"
        variant="page"
        title="이 청원·제안을 확인할 권한이 없습니다."
        description="로그인 상태를 확인해 주세요."
      />
    );
  }
  return (
    <PageState
      kind="error"
      variant="page"
      title="청원·제안을 불러오지 못했습니다."
      description="잠시 후 다시 시도해 주세요."
      action={
        <button className="detail-secondary-button" type="button" onClick={onRetry}>
          다시 시도
        </button>
      }
    />
  );
}

export function PetitionDetailPage() {
  const { petitionId } = useParams({ from: '/petitions/$petitionId' });
  const parsedId = parsePositiveRouteId(petitionId);
  const id = parsedId ?? 0;
  const queryClient = useQueryClient();
  const petitionQuery = useQuery({
    queryKey: ['petitions', 'detail', id],
    queryFn: () => getPetition(id),
    enabled: parsedId !== null,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const petition: PetitionDetail | undefined = petitionQuery.data;
  const participateMutation = useMutation({
    mutationFn: () => participatePetition(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['petitions'] }),
        queryClient.invalidateQueries({ queryKey: ['petitions', 'detail', id] }),
      ]);
    },
  });

  if (parsedId === null) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('petitions')}
        title="청원·제안을 확인할 수 없습니다"
        width="reading"
        variant="document"
      >
        <PetitionDetailError status={404} onRetry={() => undefined} />
      </PageScaffold>
    );
  }

  if (petitionQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('petitions')}
        title="청원·제안"
        width="reading"
        variant="document"
      >
        <PageState kind="loading" variant="page" title="청원·제안을 불러오는 중입니다." />
      </PageScaffold>
    );
  }

  if (petitionQuery.isError || !petition) {
    const status = petitionQuery.error instanceof ApiError ? petitionQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('petitions')}
        title="청원·제안을 확인할 수 없습니다"
        width="reading"
        variant="document"
      >
        <PetitionDetailError status={status} onRetry={() => petitionQuery.refetch()} />
      </PageScaffold>
    );
  }

  const progress = getPetitionProgress(petition);
  const participationNeedsLogin = authActionRequiresLogin(
    sessionQuery.data,
    participateMutation.error,
  );

  return (
    <PageScaffold
      breadcrumbs={detailBreadcrumbs('petitions')}
      title={petition.title}
      width="reading"
      variant="document"
      meta={
        <>
          <span className={`petition-status is-${petition.status}`}>
            {petitionStatusLabels[petition.status]}
          </span>
          <span>{petition.authorName ?? '익명 제안'}</span>
          <span>{dateFormatter.format(new Date(petition.startsAt))} 등록</span>
          <span>{dateFormatter.format(new Date(petition.endsAt))} 마감</span>
        </>
      }
    >
      <article className="petition-document">
        <section className="petition-detail-progress" aria-labelledby="petition-progress-title">
          <div className="petition-detail-progress__summary">
            <div>
              <span id="petition-progress-title">참여 현황</span>
              <strong>
                {petition.participantCount.toLocaleString('ko-KR')}
                <small> / {petition.threshold.toLocaleString('ko-KR')}명</small>
              </strong>
            </div>
            <b>{progress}%</b>
          </div>
          <div
            className="petition-detail-progress__track"
            role="progressbar"
            aria-label="청원 참여 달성률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          {petition.status === 'open' ? (
            <div className="petition-participation-action">
              <p>이 제안에 공감한다면 참여해 주세요.</p>
              {sessionQuery.isLoading ? (
                <button className="detail-primary-button" type="button" disabled>
                  로그인 상태 확인 중
                </button>
              ) : participationNeedsLogin ? (
                <Link
                  className="detail-primary-button"
                  to="/login"
                  search={{ returnTo: `/petitions/${petitionId}` }}
                >
                  <Users size={16} aria-hidden="true" /> 로그인하고 참여하기
                </Link>
              ) : (
                <button
                  className="detail-primary-button"
                  type="button"
                  onClick={() => participateMutation.mutate()}
                  disabled={participateMutation.isPending}
                >
                  <Users size={16} aria-hidden="true" />
                  {participateMutation.isPending ? '참여 처리 중' : '청원 참여하기'}
                </button>
              )}
            </div>
          ) : (
            <p className="petition-participation-closed">참여가 종료된 청원입니다.</p>
          )}
          {participateMutation.isSuccess ? (
            <p className="petition-mutation-feedback is-success" role="status">
              <CheckCircle2 size={15} aria-hidden="true" />
              {participateMutation.data.participated
                ? '참여가 반영되었습니다.'
                : '이미 참여한 청원입니다.'}
            </p>
          ) : null}
          {participateMutation.isError && !participationNeedsLogin ? (
            <p className="petition-mutation-feedback is-error" role="alert">
              참여를 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}
        </section>

        <section className="petition-reading-body" aria-label="청원 내용">
          <RichTextContent contentDoc={petition.contentDoc} plainText={petition.content} />
        </section>
      </article>

      {petition.answer ? (
        <section className="petition-answer" aria-labelledby="petition-answer-title">
          <span>공식 답변</span>
          <h2 id="petition-answer-title">학교에서 답변드립니다</h2>
          <p>{petition.answer.content}</p>
          <footer>
            {petition.answer.authorName ?? '학교 담당자'} ·{' '}
            {dateFormatter.format(new Date(petition.answer.answeredAt))}
          </footer>
        </section>
      ) : null}

      <div className="petition-bottom-actions">
        <Link className="detail-secondary-button" to="/petitions">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
