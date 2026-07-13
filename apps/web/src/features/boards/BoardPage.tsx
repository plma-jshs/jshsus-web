import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  type DataTableSearchField,
  DataTableToolbar,
} from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getBoardPosts } from './api';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function BoardPage() {
  const rawSearch = useSearch({ from: '/boards/free' });
  const search = {
    page: rawSearch.page ?? 1,
    pageSize: rawSearch.pageSize ?? 10,
    field: rawSearch.field ?? 'title_content',
    q: rawSearch.q ?? '',
  } as const;
  const navigate = useNavigate({ from: '/boards/free' });
  const postsQuery = useQuery({
    queryKey: ['board-posts', 'free', search.page, search.pageSize, search.field, search.q],
    queryFn: () => getBoardPosts('free', search),
    placeholderData: keepPreviousData,
  });
  const result = postsQuery.data;
  const posts = result?.items ?? [];

  const updateSearch = (
    next: Partial<{
      page: number;
      pageSize: DataTablePageSize;
      field: DataTableSearchField;
      q: string;
    }>,
  ) => {
    void navigate({
      search: (current) => ({ ...current, ...next }),
      replace: true,
    });
  };

  return (
    <PageScaffold
      breadcrumbs={[{ label: '커뮤니티' }, { label: '자유게시판' }]}
      title="자유게시판"
      description="학교생활의 질문과 정보를 편안하게 나누는 공간입니다."
      action={
        <Link className="detail-primary-button" to="/boards/free/new">
          <PenLine size={16} aria-hidden="true" /> 글쓰기
        </Link>
      }
    >
      <section className="data-table-section" aria-label="자유게시판 목록">
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
          <PageState kind="loading" variant="table" title="게시글을 불러오는 중입니다." />
        ) : null}
        {postsQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="게시글을 불러오지 못했습니다."
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
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
        {postsQuery.isSuccess && posts.length === 0 ? (
          <PageState
            kind="empty"
            variant="table"
            title={search.q ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
          />
        ) : null}

        {result && posts.length > 0 ? (
          <>
            <div className="data-table-viewport">
              <table className="data-table">
                <colgroup>
                  <col className="data-table__number-column" style={{ width: 76 }} />
                  <col />
                  <col className="data-table__author-column" style={{ width: 130 }} />
                  <col className="data-table__date-column" style={{ width: 140 }} />
                  <col className="data-table__views-column" style={{ width: 86 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="data-table__number" scope="col">
                      번호
                    </th>
                    <th scope="col">제목</th>
                    <th className="data-table__author" scope="col">
                      작성자
                    </th>
                    <th scope="col">등록일</th>
                    <th className="data-table__views" scope="col">
                      조회
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post, index) => (
                    <tr key={post.id}>
                      <td className="data-table__number">
                        {Math.max(result.total - (result.page - 1) * result.pageSize - index, 1)}
                      </td>
                      <td className="data-table__title-cell">
                        <Link
                          className="data-table__title-link"
                          to="/boards/free/$postId"
                          params={{ postId: String(post.id) }}
                        >
                          {post.title}
                          {post.commentCount > 0 ? (
                            <span className="data-table__comment-count">
                              [{post.commentCount.toLocaleString('ko-KR')}]
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="data-table__author">
                        {post.isAnonymous ? '익명' : (post.authorName ?? '작성자')}
                      </td>
                      <td className="data-table__date">
                        <time dateTime={post.createdAt}>
                          {dateFormatter.format(new Date(post.createdAt))}
                        </time>
                      </td>
                      <td className="data-table__views">
                        {post.viewCount.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
