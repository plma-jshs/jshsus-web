import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BedDouble, CalendarDays, ChevronRight, UsersRound } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getMyDorm } from './api';
import '../../styles/dorm.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const termLabel = (year: number, semester: number) => `${year}년 ${semester}학기`;
const roomLabel = (assignment: { dormName: string; roomName: string } | null) =>
  assignment ? `${assignment.dormName} ${assignment.roomName}` : '배정 전';

const reportStatusLabels = {
  PENDING: '접수',
  PROCESSING: '처리 중',
  COMPLETED: '처리 완료',
} as const;

export function DormPage() {
  const dormQuery = useQuery({ queryKey: ['my-dorm'], queryFn: getMyDorm });
  const data = dormQuery.data;
  const currentAssignment = data?.currentAssignment ?? null;

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('dorm')}
      title="기숙사"
      width="wide"
      action={
        <Link className="detail-primary-button" to="/dorm/reports/new">
          민원 등록
        </Link>
      }
    >
      {dormQuery.isLoading ? (
        <PageState kind="loading" variant="section" title="기숙사 정보를 불러오는 중입니다." />
      ) : null}
      {dormQuery.isError ? (
        <PageState
          kind="error"
          variant="section"
          title="기숙사 정보를 불러오지 못했습니다."
          description="잠시 후 다시 시도해 주세요."
          action={
            <button
              className="detail-secondary-button"
              type="button"
              onClick={() => dormQuery.refetch()}
            >
              다시 시도
            </button>
          }
        />
      ) : null}
      {data ? (
        <div className="dorm-page">
          <section className="dorm-overview" aria-labelledby="dorm-overview-title">
            <div className="dorm-overview__icon" aria-hidden="true">
              <BedDouble size={25} />
            </div>
            <div className="dorm-overview__copy">
              <p>{termLabel(data.currentTerm.year, data.currentTerm.semester)}</p>
              <h2 id="dorm-overview-title">
                {data.student.studentName} <span>({data.student.studentNo})</span>
              </h2>
              <strong>{roomLabel(currentAssignment)}</strong>
              {currentAssignment ? (
                <small>{currentAssignment.bedPosition}번 침대 · 현재 배정</small>
              ) : (
                <small>현재 학기 배정 정보가 없습니다.</small>
              )}
            </div>
            <ChevronRight className="dorm-overview__chevron" aria-hidden="true" size={20} />
          </section>

          <section className="dorm-section" aria-labelledby="dorm-assignment-title">
            <div className="dorm-section__heading">
              <div>
                <p className="dorm-section__eyebrow">현재 배정</p>
                <h2 id="dorm-assignment-title">기숙사 배정현황</h2>
              </div>
              <CalendarDays aria-hidden="true" size={20} />
            </div>
            {currentAssignment ? (
              <div className="dorm-table-wrap">
                <table className="dorm-table">
                  <thead>
                    <tr>
                      <th scope="col">학기</th>
                      <th scope="col">이름(학번)</th>
                      <th scope="col">배정호실</th>
                      <th scope="col">침대</th>
                      <th scope="col">학년·반</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{termLabel(currentAssignment.year, currentAssignment.semester)}</td>
                      <td>
                        <strong>{currentAssignment.studentName}</strong> (
                        {currentAssignment.studentNo})
                      </td>
                      <td>{roomLabel(currentAssignment)}</td>
                      <td>{currentAssignment.bedPosition}번</td>
                      <td>
                        {currentAssignment.grade}학년 {currentAssignment.classNo}반
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <PageState kind="empty" variant="inline" title="현재 학기 배정 정보가 없습니다." />
            )}
          </section>

          <section className="dorm-section" aria-labelledby="dorm-roommates-title">
            <div className="dorm-section__heading">
              <div>
                <p className="dorm-section__eyebrow">같은 방</p>
                <h2 id="dorm-roommates-title">룸메이트</h2>
              </div>
              <UsersRound aria-hidden="true" size={20} />
            </div>
            {data.roommates.length ? (
              <div className="dorm-table-wrap">
                <table className="dorm-table">
                  <thead>
                    <tr>
                      <th scope="col">이름(학번)</th>
                      <th scope="col">학년·반</th>
                      <th scope="col">침대</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roommates.map((roommate) => (
                      <tr key={roommate.studentNo}>
                        <td>
                          <strong>{roommate.studentName}</strong> ({roommate.studentNo})
                        </td>
                        <td>
                          {roommate.grade}학년 {roommate.classNo}반
                        </td>
                        <td>{roommate.bedPosition}번</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageState kind="empty" variant="inline" title="등록된 룸메이트가 없습니다." />
            )}
          </section>

          <section className="dorm-section" aria-labelledby="dorm-history-title">
            <div className="dorm-section__heading">
              <div>
                <p className="dorm-section__eyebrow">지난 기록</p>
                <h2 id="dorm-history-title">배정이력</h2>
              </div>
            </div>
            {data.assignmentHistory.length ? (
              <div className="dorm-table-wrap">
                <table className="dorm-table">
                  <thead>
                    <tr>
                      <th scope="col">학기</th>
                      <th scope="col">배정호실</th>
                      <th scope="col">침대</th>
                      <th scope="col">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignmentHistory.map((assignment) => {
                      const isCurrent =
                        assignment.year === data.currentTerm.year &&
                        assignment.semester === data.currentTerm.semester;
                      return (
                        <tr key={assignment.id}>
                          <td>{termLabel(assignment.year, assignment.semester)}</td>
                          <td>{roomLabel(assignment)}</td>
                          <td>{assignment.bedPosition}번</td>
                          <td>
                            <span className={`dorm-status${isCurrent ? ' is-current' : ''}`}>
                              {isCurrent ? '현재' : '지난 배정'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageState kind="empty" variant="inline" title="배정이력이 없습니다." />
            )}
          </section>

          <section className="dorm-section" aria-labelledby="dorm-reports-title">
            <div className="dorm-section__heading">
              <div>
                <p className="dorm-section__eyebrow">문의 및 요청</p>
                <h2 id="dorm-reports-title">민원 현황</h2>
              </div>
              <Link className="dorm-section__action" to="/dorm/reports/new">
                등록
              </Link>
            </div>
            {data.reports.length ? (
              <div className="dorm-table-wrap">
                <table className="dorm-table dorm-table--reports">
                  <thead>
                    <tr>
                      <th scope="col">접수일</th>
                      <th scope="col">공간</th>
                      <th scope="col">내용</th>
                      <th scope="col">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reports.map((report) => (
                      <tr key={report.id}>
                        <td>{dateFormatter.format(new Date(report.createdAt))}</td>
                        <td>
                          {report.dormName} {report.roomName}
                        </td>
                        <td className="dorm-table__description">{report.description}</td>
                        <td>
                          <span
                            className={`dorm-status dorm-status--${report.status.toLowerCase()}`}
                          >
                            {reportStatusLabels[report.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageState kind="empty" variant="inline" title="등록한 민원이 없습니다." />
            )}
          </section>
        </div>
      ) : null}
    </PageScaffold>
  );
}
