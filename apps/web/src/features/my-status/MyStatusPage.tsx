import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BedDouble, CircleUserRound, ClipboardCheck, Smartphone } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyStatus } from './api';
import '../../styles/my-status.css';

const dateFormatter = createKoreanDateFormatter({ month: 'long', day: 'numeric' });

function formatRecordDate(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}. ${digits.slice(4, 6)}. ${digits.slice(6, 8)}`;
  }
  return value;
}

export function MyStatusPage() {
  const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getMyStatus });

  if (statusQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '학교생활' }, { label: '마이페이지' }]}
        title="마이페이지"
        width="wide"
        variant="workspace"
      >
        <PageState kind="loading" title="마이페이지를 불러오는 중입니다." variant="page" />
      </PageScaffold>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    const error = statusQuery.error;
    const statusCode = error instanceof ApiError ? error.status : undefined;
    const isUnauthenticated = statusCode === 401;
    const isStudentUnlinked = statusCode === 400 || statusCode === 404;

    return (
      <PageScaffold
        breadcrumbs={[{ label: '학교생활' }, { label: '마이페이지' }]}
        title="마이페이지"
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
                : '마이페이지를 불러오지 못했습니다.'
          }
          description={
            isUnauthenticated
              ? '로그인 후 상벌점과 생활 정보를 확인할 수 있습니다.'
              : isStudentUnlinked
                ? '통합로그인 계정에 학생 정보가 연결되어 있는지 학생생활부에 문의해 주세요.'
                : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          }
          action={
            isUnauthenticated ? (
              <Link
                className="detail-primary-button"
                to="/login"
                search={{ returnTo: '/my-status' }}
              >
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

  return (
    <PageScaffold
      breadcrumbs={[{ label: '학교생활' }, { label: '마이페이지' }]}
      title="마이페이지"
      description="학교생활에 연결된 내 정보를 확인하세요."
      width="wide"
      variant="workspace"
    >
      <section className="status-identity" aria-labelledby="status-student-name">
        <CircleUserRound size={36} aria-hidden="true" />
        <div>
          <h2 id="status-student-name">{status.student.name}</h2>
          <p>
            <span>{status.student.grade}학년</span>
            <span>{status.student.classNo}반</span>
            <span>{status.student.number}번</span>
            <span>학번 {status.student.studentNo}</span>
          </p>
        </div>
      </section>

      <section className="status-summary" aria-label="상벌점 요약">
        <article className="is-positive">
          <span>상점</span>
          <strong>+{status.points.meritPoint}</strong>
          <small>누적 점수</small>
        </article>
        <article className="is-negative">
          <span>벌점</span>
          <strong>{status.points.penaltyPoint ? `-${status.points.penaltyPoint}` : '0'}</strong>
          <small>누적 점수</small>
        </article>
        <article className="is-total">
          <span>합계</span>
          <strong>
            {status.points.currentPoint > 0 ? '+' : ''}
            {status.points.currentPoint}
          </strong>
          <small>현재 점수</small>
        </article>
      </section>

      <section className="status-life" aria-label="생활 정보">
        <article>
          <BedDouble size={20} aria-hidden="true" />
          <div>
            <span>기숙사</span>
            <strong>
              {status.dorm ? `${status.dorm.dormName} ${status.dorm.roomName}` : '미배정'}
            </strong>
            <small>{status.dorm ? `${status.dorm.bedPosition}번 침대` : '배정 정보 없음'}</small>
          </div>
        </article>
        <article>
          <Smartphone size={20} aria-hidden="true" />
          <div>
            <span>스마트폰 보관함</span>
            <strong>{status.deviceCase ? `${status.deviceCase.id}번` : '미연결'}</strong>
            <small>
              {status.deviceCase
                ? `${status.deviceCase.isOpen ? '열림' : '닫힘'} · ${status.deviceCase.isConnected ? '연결 정상' : '연결 끊김'}`
                : '연결 정보 없음'}
            </small>
          </div>
        </article>
      </section>

      <section className="status-records" aria-labelledby="status-records-title">
        <header>
          <h2 id="status-records-title">최근 상벌점</h2>
          <span>{status.points.records.length}건</span>
        </header>
        {status.points.records.length ? (
          <div className="status-records__table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col">점수</th>
                  <th scope="col">사유</th>
                  <th scope="col">담당</th>
                </tr>
              </thead>
              <tbody>
                {status.points.records.slice(0, 8).map((record) => (
                  <tr key={record.id}>
                    <td>{formatRecordDate(record.baseDate)}</td>
                    <td>
                      <span className={record.point > 0 ? 'is-positive' : 'is-negative'}>
                        {record.point > 0 ? `+${record.point}` : record.point}
                      </span>
                    </td>
                    <td>
                      <strong>{record.reason}</strong>
                      {record.comment ? <small>{record.comment}</small> : null}
                      <small className="status-record__teacher-mobile">
                        {record.teacherName} 선생님
                      </small>
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
      </section>

      <section className="status-activity" aria-labelledby="status-activity-title">
        <header>
          <ClipboardCheck size={18} aria-hidden="true" />
          <h2 id="status-activity-title">최근 탐구활동서</h2>
          <Link to="/activity-requests">전체 신청 보기</Link>
        </header>
        {status.latestActivityRequest ? (
          <Link
            className="status-activity__row"
            to="/activity-requests/$requestId"
            params={{ requestId: String(status.latestActivityRequest.id) }}
          >
            <strong>{status.latestActivityRequest.purpose}</strong>
            <span>
              {dateFormatter.format(new Date(status.latestActivityRequest.startsAt))} ·{' '}
              {status.latestActivityRequest.location}
            </span>
          </Link>
        ) : (
          <p className="status-activity__empty">최근 신청 내역이 없습니다.</p>
        )}
      </section>

      <p className="status-help">
        상벌점 기록이나 생활 정보가 실제와 다르면 학생생활부에 문의해 주세요.
      </p>
    </PageScaffold>
  );
}
