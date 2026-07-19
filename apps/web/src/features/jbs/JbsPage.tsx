import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Eye, MessageCircle, Plus } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  type DataTableSearchField,
  DataTableToolbar,
} from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { formatKoreanRelativeTime } from '../../shared/lib/date';
import { getSession } from '../auth/api';
import { getJbsPosts } from './api';
import './jbs.css';

export function JbsPage() {
  const rawSearch = useSearch({ from: '/jbs' });
  const search = {
    page: rawSearch.page ?? 1,
    pageSize: rawSearch.pageSize ?? 20,
    field: rawSearch.field ?? 'title_content',
    q: rawSearch.q ?? '',
  } as const;
  const navigate = useNavigate({ from: '/jbs' });
  const postsQuery = useQuery({
    queryKey: ['jbs-posts', search.page, search.pageSize, search.field, search.q],
    queryFn: () => getJbsPosts(search),
    placeholderData: keepPreviousData,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const session = sessionQuery.data;
  const canPublish =
    session?.isLogined &&
    (session.roles?.includes('system_admin') || session.permissions.includes('jbs.publish'));
  const result = postsQuery.data;

  const updateSearch = (
    next: Partial<{
      page: number;
      pageSize: DataTablePageSize;
      field: DataTableSearchField;
      q: string;
    }>,
  ) => void navigate({ search: (current) => ({ ...current, ...next }), replace: true });

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('jbs')}
      title="JBS"
      description="방송부 페이지입니다."
      width="wide"
      action={
        canPublish ? (
          <Link className="detail-primary-button" to="/jbs/new">
            <Plus size={16} aria-hidden="true" /> 영상 등록
          </Link>
        ) : undefined
      }
    >
      <section className="jbs-list" aria-label="JBS 영상 목록">
        <DataTableToolbar
          key={`${search.field}:${search.q}`}
          total={result?.total ?? 0}
          page={result?.page ?? search.page}
          totalPages={result?.totalPages ?? 0}
          pageSize={search.pageSize}
          field={search.field}
          query={search.q}
          onPageSizeChange={(pageSize) => updateSearch({ page: 1, pageSize })}
          onSearch={(field, q) => updateSearch({ page: 1, field, q })}
        />

        {postsQuery.isLoading ? (
          <PageState kind="loading" title="JBS 영상을 불러오는 중입니다." />
        ) : null}
        {postsQuery.isError ? (
          <PageState
            kind="error"
            title="JBS 영상을 불러오지 못했습니다."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => postsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {postsQuery.isSuccess && result?.items.length === 0 ? (
          <PageState
            kind="empty"
            title={search.q ? '검색 결과가 없습니다.' : '등록된 JBS 영상이 없습니다.'}
          />
        ) : null}

        {result?.items.length ? (
          <>
            <div className="jbs-card-grid">
              {result.items.map((post) => (
                <article className="jbs-card" key={post.id}>
                  <Link
                    className="jbs-card__thumbnail"
                    to="/jbs/$postId"
                    params={{ postId: String(post.id) }}
                    aria-label={`${post.title} 영상 보기`}
                  >
                    <img src={post.thumbnailUrl} alt="" loading="lazy" />
                    <span className="jbs-card__play" aria-hidden="true" />
                  </Link>
                  <div className="jbs-card__body">
                    <Link
                      className="jbs-card__title"
                      to="/jbs/$postId"
                      params={{ postId: String(post.id) }}
                    >
                      {post.title}
                    </Link>
                    <p>{post.description}</p>
                    <div className="jbs-card__meta">
                      <span>{post.authorName ?? '방송부'}</span>
                      <time dateTime={post.createdAt}>
                        {formatKoreanRelativeTime(post.createdAt)}
                      </time>
                      <span>
                        <Eye size={13} aria-hidden="true" /> {post.viewCount}
                      </span>
                      <span>
                        <MessageCircle size={13} aria-hidden="true" /> {post.commentCount}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <DataTablePagination
              page={result.page}
              totalPages={result.totalPages}
              onChange={(page) => updateSearch({ page })}
            />
          </>
        ) : null}
      </section>
    </PageScaffold>
  );
}
