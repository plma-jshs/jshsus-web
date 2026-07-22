import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { DataTablePagination } from '../../components/page/DataTableControls';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { getMyStatus } from '../my-status/api';
import { PointsSummary } from '../my-status/PointsSummary';
import '../../styles/my-status.css';

function formatRecordDate(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}. ${digits.slice(4, 6)}. ${digits.slice(6, 8)}`;
  }
  return value;
}

export function PointsPage() {
  const [page, setPage] = useState(1);
  const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getMyStatus });

  if (statusQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={listBreadcrumbs('points')}
        title="상벌점"
        width="wide"
        variant="workspace"
      >
        <PageState kind="loading" title="상벌점 정보를 불러오는 중입니다." variant="page" />
      </PageScaffold>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    const statusCode = statusQuery.error instanceof ApiError ? statusQuery.error.status : undefined;
    const isUnauthenticated = statusCode === 401;
    const isStudentUnlinked = statusCode === 400 || statusCode === 404;

    return (
      <PageScaffold
        breadcrumbs={listBreadcrumbs('points')}
        title="상벌점"
        width="wide"
        variant="workspace"
      >
        <PageState
          kind={isStudentUnlinked ? 'empty' : 'error'}
          title={
            isUnauthenticated
              ? '로그인이 필요합니다.'
              : isStudentUnlinked
                ? '학생 정보를 연결할 수 없습니다.'
                : '상벌점 정보를 불러오지 못했습니다.'
          }
          description={
            isUnauthenticated
              ? '로그인 후 상벌점 기록을 확인할 수 있습니다.'
              : isStudentUnlinked
                ? '통합로그인 계정에 학생 정보가 연결되어 있는지 학생생활부에 문의해 주세요.'
                : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          }
          action={
            isUnauthenticated ? (
              <Link className="detail-primary-button" to="/login" search={{ returnTo: '/points' }}>
                로그인
              </Link>
            ) : !isStudentUnlinked ? (
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => statusQuery.refetch()}
              >
                다시 시도
              </button>
            ) : null
          }
          variant="page"
        />
      </PageScaffold>
    );
  }

  const status = statusQuery.data;
  const pageSize = 20;
  const totalPages = Math.ceil(status.points.records.length / pageSize);
  const safePage = Math.min(page, Math.max(totalPages, 1));
  const visibleRecords = status.points.records.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('points')}
      title="상벌점"
      width="wide"
      variant="workspace"
    >
      <section className="points-card" aria-labelledby="points-records-title">
        <PointsSummary points={status.points} />

        <div className="status-records">
          <header>
            <h2 id="points-records-title">상벌점 기록</h2>
            <span>최근 {status.points.records.length}건</span>
          </header>
          {status.points.records.length ? (
            <div className="status-records__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">날짜</th>
                    <th scope="col">점수</th>
                    <th scope="col">사유</th>
                    <th scope="col">처리자</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{formatRecordDate(record.baseDate)}</td>
                      <td>
                        <span className={record.point > 0 ? 'is-positive' : 'is-negative'}>
                          {record.point > 0 ? `+${record.point}` : record.point}
                        </span>
                      </td>
                      <td>
                        <strong>{record.reason}</strong>
                      </td>
                      <td>{record.teacherName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <PageState kind="empty" title="상벌점 기록이 없습니다." variant="table" />
          )}
          {status.points.records.length ? (
            <DataTablePagination page={safePage} totalPages={totalPages} onChange={setPage} />
          ) : null}
        </div>
      </section>

      <p className="status-help">기록이 실제와 다르면 학생생활부에 문의해 주세요.</p>
    </PageScaffold>
  );
}
