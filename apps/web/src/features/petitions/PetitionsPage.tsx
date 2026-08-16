import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
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
  type PetitionSearchField,
  petitionStatusLabels,
} from './presentation';
import '../../styles/petitions.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function PetitionsPage() {
  const navigate = useNavigate({ from: '/petitions' });
  const routeSearch = useSearch({ from: '/petitions' });
  const petitionsQuery = useQuery({ queryKey: ['petitions'], queryFn: getPetitions });
  const [filter, setFilter] = useState<PetitionFilter>('all');
  const [query, setQuery] = useState(routeSearch.q ?? '');
  const [searchField, setSearchField] = useState<PetitionSearchField>('title_content');
  const page = routeSearch.page ?? 1;
  const pageSize = routeSearch.size ?? 20;
  const updateTableSearch = useCallback(
    (next: { page?: number; size?: 20 | 50 | 100; field?: PetitionSearchField; q?: string }) => {
      void navigate({
        search: (current) => ({
          ...current,
          page: next.page ?? current.page ?? 1,
          size: next.size ?? current.size ?? 20,
          field: 'title_content',
          q: next.q ?? current.q,
        }),
      });
    },
    [navigate],
  );
  const petitions = useMemo(() => petitionsQuery.data ?? [], [petitionsQuery.data]);
  const filtered = useMemo(
    () =>
      petitions.filter(
        (petition) =>
          matchesPetitionFilter(petition, filter) &&
          matchesPetitionQuery(petition, query, searchField),
      ),
    [filter, petitions, query, searchField],
  );
  const totalPages = Math.ceil(filtered.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const rawSize =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('size');
  const hasInvalidSize = rawSize !== null && ![20, 50, 100].includes(Number(rawSize));
  useEffect(() => {
    if (!petitionsQuery.isSuccess) return;
    if (hasInvalidSize || page !== safePage)
      updateTableSearch({
        page: hasInvalidSize ? 1 : safePage,
        size: hasInvalidSize ? 20 : pageSize,
      });
  }, [hasInvalidSize, page, pageSize, petitionsQuery.isSuccess, safePage, updateTableSearch]);
  const [mobileVisibleState, setMobileVisibleState] = useState<{ key: string; count: number }>({
    key: '',
    count: pageSize,
  });
  const visiblePetitions = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const mobileVisibleKey = `${filter}|${query}|${searchField}|${safePage}`;
  const mobileVisibleCount =
    mobileVisibleState.key === mobileVisibleKey ? mobileVisibleState.count : pageSize;
  const mobileAdditionalPetitions =
    safePage === 1 && mobileVisibleState.key === mobileVisibleKey
      ? filtered.slice(pageSize, mobileVisibleCount)
      : [];
  const displayedPetitions = [...visiblePetitions, ...mobileAdditionalPetitions];

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
      action={
        <Link
          aria-label="제안하기"
          className="detail-primary-button content-compose-fab petition-compose-action"
          title="제안하기"
          to="/petitions/new"
        >
          <PenLine size={20} aria-hidden="true" />
        </Link>
      }
    >
      <section className="workflow-table-section petition-list-section" aria-label="청원 목록">
        <PageToolbar
          filters={
            <FilterChips
              value={filter}
              onChange={(value) => {
                setFilter(value);
                updateTableSearch({ page: 1 });
              }}
              label="청원 상태"
              options={filterOptions}
            />
          }
          search={
            <div className="petition-search-controls">
              <SearchField
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  updateTableSearch({ page: 1, q: value });
                }}
                label="청원 검색"
                placeholder="제목, 내용, 작성자 검색"
              />
              <Link
                className="detail-primary-button data-table-toolbar__create petition-compose-inline"
                to="/petitions/new"
              >
                작성
              </Link>
            </div>
          }
        />

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
                    setSearchField('title_content');
                    updateTableSearch({ page: 1, field: 'title_content', q: '' });
                  }}
                >
                  검색 초기화
                </button>
              ) : null
            }
          />
        ) : null}

        {filtered.length ? (
          <div className="petition-card-list">
            {displayedPetitions.map((petition) => {
              const progress = getPetitionProgress(petition);
              return (
                <article className="petition-card" key={petition.id}>
                  <div className="petition-card__main">
                    <div className="petition-card__eyebrow">
                      <span className={`petition-status is-${petition.status}`}>
                        {petitionStatusLabels[petition.status]}
                      </span>
                      <span>{petition.authorName ?? '익명 제안'}</span>
                    </div>
                    <Link
                      className="petition-card__title"
                      to="/petitions/$petitionId"
                      params={{ petitionId: String(petition.id) }}
                    >
                      <span className="content-title-line">
                        <span className="content-title-line__text">{petition.title}</span>
                        <ContentBadges createdAt={petition.startsAt} />
                      </span>
                    </Link>
                    <p className="petition-card__excerpt">{petition.content}</p>
                    <div className="petition-card__meta">
                      <time dateTime={petition.startsAt}>
                        등록 {dateFormatter.format(new Date(petition.startsAt))}
                      </time>
                      <time dateTime={petition.endsAt}>
                        마감 {dateFormatter.format(new Date(petition.endsAt))}
                      </time>
                    </div>
                  </div>
                  <div className="petition-card__side">
                    <span>참여</span>
                    <strong>
                      {petition.participantCount.toLocaleString('ko-KR')}
                      <small> / {petition.threshold.toLocaleString('ko-KR')}명</small>
                    </strong>
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
                    <b>{progress}%</b>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {filtered.length ? (
          <DataTablePagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onPageSizeChange={(nextSize) => {
              updateTableSearch({ page: 1, size: nextSize });
            }}
            hasMore={safePage === 1 && mobileVisibleCount < filtered.length}
            onLoadMore={() =>
              setMobileVisibleState({
                key: mobileVisibleKey,
                count: mobileVisibleCount + pageSize,
              })
            }
            onChange={(nextPage) => updateTableSearch({ page: nextPage })}
          />
        ) : null}
      </section>
    </PageScaffold>
  );
}
