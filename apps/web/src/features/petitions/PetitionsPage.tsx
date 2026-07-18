import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { ContentBadges } from '../../components/page/ContentBadges';
import { DataTablePagination } from '../../components/page/DataTableControls';
import {
  FilterChips,
  PageScaffold,
  PageState,
  PageToolbar,
  SearchField,
} from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getPetitions } from './api';
import {
  getPetitionProgress,
  matchesPetitionFilter,
  matchesPetitionQuery,
  type PetitionFilter,
  petitionStatusLabels,
} from './presentation';
import '../../styles/petitions.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function PetitionsPage() {
  const petitionsQuery = useQuery({ queryKey: ['petitions'], queryFn: getPetitions });
  const [filter, setFilter] = useState<PetitionFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const petitions = useMemo(() => petitionsQuery.data ?? [], [petitionsQuery.data]);
  const filtered = useMemo(
    () =>
      petitions.filter(
        (petition) =>
          matchesPetitionFilter(petition, filter) && matchesPetitionQuery(petition, query),
      ),
    [filter, petitions, query],
  );
  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visiblePetitions = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filterOptions: Array<{ value: PetitionFilter; label: string; count: number }> = [
    { value: 'all', label: '전체', count: petitions.length },
    {
      value: 'open',
      label: '진행 중',
      count: petitions.filter((item) => item.status === 'open').length,
    },
    {
      value: 'awaiting_answer',
      label: '답변 대기',
      count: petitions.filter((item) => item.status === 'awaiting_answer').length,
    },
    {
      value: 'answered',
      label: '답변 완료',
      count: petitions.filter((item) => item.status === 'answered').length,
    },
  ];

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('petitions')}
      title="청원·제안"
      description="학교생활 개선 제안을 확인하고 참여하세요."
      action={
        <Link className="detail-primary-button" to="/petitions/new">
          <PenLine size={16} aria-hidden="true" /> 제안하기
        </Link>
      }
    >
      <section className="workflow-table-section petition-table-section" aria-label="청원 목록">
        <PageToolbar>
          <FilterChips
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            label="청원 상태"
            options={filterOptions}
          />
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            label="청원 검색"
            placeholder="제목, 내용, 작성자 검색"
          />
        </PageToolbar>

        <div className="workflow-table-summary petition-table-summary" aria-live="polite">
          {query.trim() || filter !== 'all'
            ? `검색 결과 ${filtered.length}건`
            : `총 ${petitions.length}건`}
        </div>

        {petitionsQuery.isLoading ? (
          <PageState kind="loading" variant="table" title="청원·제안을 불러오는 중입니다." />
        ) : null}
        {petitionsQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="청원·제안을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => petitionsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {petitionsQuery.isSuccess && !filtered.length ? (
          <PageState
            kind="empty"
            variant="table"
            title={petitions.length ? '검색 결과가 없습니다.' : '등록된 청원·제안이 없습니다.'}
            action={
              petitions.length ? (
                <button
                  className="detail-secondary-button"
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                    setPage(1);
                  }}
                >
                  검색 초기화
                </button>
              ) : null
            }
          />
        ) : null}

        {filtered.length ? (
          <div className="workflow-table-viewport petition-table-viewport">
            <table className="workflow-table petition-table">
              <colgroup>
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 144 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  <th scope="col">제목</th>
                  <th scope="col">마감일</th>
                  <th scope="col">참여</th>
                  <th scope="col">달성률</th>
                </tr>
              </thead>
              <tbody>
                {visiblePetitions.map((petition) => {
                  const progress = getPetitionProgress(petition);
                  return (
                    <tr key={petition.id}>
                      <td data-label="상태">
                        <span className={`petition-status is-${petition.status}`}>
                          {petitionStatusLabels[petition.status]}
                        </span>
                      </td>
                      <td className="petition-table__title" data-label="제목">
                        <Link
                          to="/petitions/$petitionId"
                          params={{ petitionId: String(petition.id) }}
                        >
                          <span className="content-title-line">
                            <span className="content-title-line__text">{petition.title}</span>
                            <ContentBadges createdAt={petition.startsAt} />
                          </span>
                        </Link>
                      </td>
                      <td className="petition-table__date" data-label="마감일">
                        <time dateTime={petition.endsAt}>
                          {dateFormatter.format(new Date(petition.endsAt))}
                        </time>
                      </td>
                      <td className="petition-table__participants" data-label="참여">
                        <strong>{petition.participantCount.toLocaleString('ko-KR')}</strong>
                        <span> / {petition.threshold.toLocaleString('ko-KR')}명</span>
                      </td>
                      <td className="petition-table__progress" data-label="달성률">
                        <div
                          className="petition-progress"
                          role="progressbar"
                          aria-label={`${petition.title} 참여 달성률`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress}
                        >
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <small>{progress}%</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {filtered.length ? (
          <DataTablePagination page={safePage} totalPages={totalPages} onChange={setPage} />
        ) : null}
      </section>
    </PageScaffold>
  );
}
