import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Eye, PenLine } from 'lucide-react';
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
const noticeMobileDateFormatter = createKoreanDateFormatter({
  month: '2-digit',
  day: '2-digit',
});

export function NoticesPage() {
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const rawSearch = useSearch({ from: '/notices' });
  const search = {
    page: rawSearch.page ?? 1,
    pageSize: rawSearch.size ?? 20,
    field: rawSearch.field ?? 'title_content',
    q: rawSearch.q ?? '',
  };
  const navigate = useNavigate({ from: '/notices' });
  const noticesQuery = useQuery({
    queryKey: ['notices', search.page, search.pageSize, search.field, search.q],
    queryFn: () => getNotices(search),
    placeholderData: keepPreviousData,
  });
  const result = noticesQuery.data;
  const notices = result?.items ?? [];
  const visibleNotices = notices;

  const updateSearch = (
    next: Partial<{
      page: number;
      pageSize: DataTablePageSize;
      field: DataTableSearchField;
      q: string;
    }>,
  ) => {
    void navigate({
      search: (current) => ({
        ...current,
        page: next.page ?? search.page,
        size: next.pageSize ?? search.pageSize,
        field: next.field ?? search.field,
        q: next.q ?? search.q,
      }),
    });
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('notices')}
      title="공지사항"
      action={
        sessionQuery.data?.isLogined && sessionQuery.data.permissions.includes('notices.manage') ? (
          <Link
            aria-label="공지 작성"
            className="detail-primary-button content-compose-fab"
            title="공지 작성"
            to="/notices/new"
          >
            <PenLine size={20} aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <section className="data-table-section" aria-label="공지 목록">
        <DataTableToolbar
          total={result?.total ?? 0}
          page={result?.page ?? search.page}
          totalPages={result?.totalPages ?? 0}
          pageSize={search.pageSize}
          field={search.field}
          query={search.q}
          action={
            sessionQuery.data?.isLogined &&
            sessionQuery.data.permissions.includes('notices.manage') ? (
              <Link className="detail-primary-button data-table-toolbar__create" to="/notices/new">
                작성
              </Link>
            ) : undefined
          }
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

        {noticesQuery.isSuccess && visibleNotices.length === 0 ? (
          <PageState
            kind="empty"
            variant="table"
            title={search.q ? '검색 결과가 없습니다.' : '등록된 공지가 없습니다.'}
          />
        ) : null}

        {result && visibleNotices.length > 0 ? (
          <>
            <div className="data-table-viewport">
              <table className="data-table">
                <colgroup>
                  <col className="data-table__number-column" style={{ width: 76 }} />
                  <col />
                  <col className="data-table__author-column" style={{ width: 190 }} />
                  <col className="data-table__date-column" style={{ width: 124 }} />
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
                    <th scope="col">작성일</th>
                    <th className="data-table__views" scope="col">
                      조회
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleNotices.map((notice) => (
                    <tr
                      className={`data-table__clickable-row${notice.pinned ? ' is-pinned' : ''}`}
                      key={notice.id}
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        void navigate({
                          to: '/notices/$noticeId',
                          params: { noticeId: String(notice.id) },
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        void navigate({
                          to: '/notices/$noticeId',
                          params: { noticeId: String(notice.id) },
                        });
                      }}
                    >
                      <td className="data-table__number">{notice.publicNumber}</td>
                      <td className="data-table__title-cell">
                        <span className="data-table__row-title">
                          <span className="data-table__title-text">{notice.title}</span>
                          <ContentBadges pinned={notice.pinned} createdAt={notice.publishedAt} />
                        </span>
                      </td>
                      <td className="data-table__author">{notice.department}</td>
                      <td className="data-table__date">
                        <time className="data-table__date-desktop" dateTime={notice.publishedAt}>
                          {noticeDateFormatter.format(new Date(notice.publishedAt))}
                        </time>
                        <time className="data-table__date-mobile" dateTime={notice.publishedAt}>
                          {noticeMobileDateFormatter.format(new Date(notice.publishedAt))}
                        </time>
                      </td>
                      <td className="data-table__views">
                        <span className="data-table__view-count">
                          <Eye size={14} aria-hidden="true" />
                          {notice.viewCount.toLocaleString('ko-KR')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={search.pageSize}
              onPageSizeChange={(pageSize) => updateSearch({ page: 1, pageSize })}
              onChange={(page) => updateSearch({ page })}
              syncUrl={false}
            />
          </>
        ) : null}
      </section>
    </PageScaffold>
  );
}
