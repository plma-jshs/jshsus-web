import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  type DataTableSearchField,
  DataTableToolbar,
} from '../../components/page/DataTableControls';
import { ContentBadges } from '../../components/page/ContentBadges';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getSession } from '../auth/api';
import { getNotices } from './api';

const noticeDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function NoticesPage() {
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const rawSearch = useSearch({ from: '/notices' });
  const search = {
    page: rawSearch.page ?? 1,
    pageSize: rawSearch.pageSize ?? 20,
    field: rawSearch.field ?? 'title_content',
    q: rawSearch.q ?? '',
  } as const;
  const navigate = useNavigate({ from: '/notices' });
  const noticesQuery = useQuery({
    queryKey: ['notices', search.page, search.pageSize, search.field, search.q],
    queryFn: () => getNotices(search),
    placeholderData: keepPreviousData,
  });
  const result = noticesQuery.data;
  const notices = result?.items ?? [];

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
      breadcrumbs={listBreadcrumbs('notices')}
      title="공지사항"
      description="학교 공지와 학생생활 안내를 확인하세요."
      action={
        sessionQuery.data?.isLogined && sessionQuery.data.permissions.includes('notices.manage') ? (
          <Link className="detail-primary-button" to="/notices/new">
            <PenLine size={16} aria-hidden="true" /> 공지 작성
          </Link>
        ) : undefined
      }
    >
      <section className="data-table-section" aria-label="공지 목록">
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

        {noticesQuery.isLoading ? (
          <PageState kind="loading" variant="table" title="공지를 불러오는 중입니다." />
        ) : null}
        {noticesQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="공지를 불러오지 못했습니다."
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => noticesQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}

        {noticesQuery.isSuccess && notices.length === 0 ? (
          <PageState
            kind="empty"
            variant="table"
            title={search.q ? '검색 결과가 없습니다.' : '등록된 공지가 없습니다.'}
          />
        ) : null}

        {result && notices.length > 0 ? (
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
                  {notices.map((notice, index) => (
                    <tr className={notice.pinned ? 'is-pinned' : undefined} key={notice.id}>
                      <td className="data-table__number">
                        {Math.max(result.total - (result.page - 1) * result.pageSize - index, 1)}
                      </td>
                      <td className="data-table__title-cell">
                        <Link
                          className="data-table__title-link"
                          to="/notices/$noticeId"
                          params={{ noticeId: String(notice.id) }}
                        >
                          <span className="data-table__title-text">{notice.title}</span>
                          <ContentBadges pinned={notice.pinned} createdAt={notice.publishedAt} />
                        </Link>
                      </td>
                      <td className="data-table__author">{notice.department}</td>
                      <td className="data-table__date">
                        <time dateTime={notice.publishedAt}>
                          {noticeDateFormatter.format(new Date(notice.publishedAt))}
                        </time>
                      </td>
                      <td className="data-table__views">
                        {notice.viewCount.toLocaleString('ko-KR')}
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
