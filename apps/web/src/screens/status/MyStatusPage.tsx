import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, BedDouble, ClipboardCheck, Loader2, Smartphone } from 'lucide-react';
import { getMyStatus } from '../../lib/api';

export function MyStatusPage() {
  const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getMyStatus });

  if (statusQuery.isLoading) {
    return (
      <section className="loading-panel">
        <Loader2 className="spin" size={22} />
        <span>내 상태를 불러오는 중</span>
      </section>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <section className="error-panel">
        <h2>내 상태를 불러오지 못했습니다</h2>
        <p>로그인 상태와 API 서버 연결을 확인해주세요.</p>
      </section>
    );
  }

  const status = statusQuery.data;

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">내 상태</span>
          <h2>
            {status.student.studentNo} {status.student.name}
          </h2>
          <p>
            {status.student.grade}학년 {status.student.classNo}반 {status.student.number}번 생활
            정보를 확인합니다.
          </p>
        </div>
        <div className="today-card">
          <BadgeCheck size={20} />
          <span>상벌점 합계</span>
          <strong>{status.points.currentPoint}점</strong>
        </div>
      </section>

      <section className="status-grid wide">
        <article>
          <span>상점 합계</span>
          <strong>{status.points.meritPoint}</strong>
        </article>
        <article>
          <span>벌점 합계</span>
          <strong>{status.points.penaltyPoint}</strong>
        </article>
        <article>
          <span>기숙사</span>
          <strong>{status.dorm ? `${status.dorm.dormName} ${status.dorm.roomName}` : '-'}</strong>
        </article>
        <article>
          <span>보관함</span>
          <strong>
            {status.deviceCase
              ? `${status.deviceCase.id}번 ${status.deviceCase.isOpen ? '열림' : '닫힘'}`
              : '-'}
          </strong>
        </article>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <BadgeCheck size={19} />
            <h2>최근 상벌점</h2>
          </div>
          <div className="list-stack">
            {status.points.records.map((record) => (
              <article className="list-row" key={record.id}>
                <div>
                  <span className="row-meta">
                    {record.baseDate} · {record.teacherName}
                  </span>
                  <h3>{record.reason}</h3>
                  <p>{record.comment || '메모 없음'}</p>
                </div>
                <span className="badge subtle">
                  {record.point > 0 ? `+${record.point}` : record.point}
                </span>
              </article>
            ))}
            {status.points.records.length === 0 ? (
              <p className="empty-text">상벌점 기록이 없습니다.</p>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <BedDouble size={19} />
            <h2>기숙사</h2>
          </div>
          {status.dorm ? (
            <div className="detail-list">
              <div>
                <span>방</span>
                <strong>
                  {status.dorm.dormName} {status.dorm.roomName}
                </strong>
              </div>
              <div>
                <span>학기</span>
                <strong>
                  {status.dorm.year}년 {status.dorm.semester}학기
                </strong>
              </div>
              <div>
                <span>침대</span>
                <strong>{status.dorm.bedPosition}번</strong>
              </div>
            </div>
          ) : (
            <p className="empty-text">기숙사 배정 정보가 없습니다.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <Smartphone size={19} />
            <h2>스마트폰 보관함</h2>
          </div>
          {status.deviceCase ? (
            <div className="detail-list">
              <div>
                <span>보관함</span>
                <strong>{status.deviceCase.id}번</strong>
              </div>
              <div>
                <span>상태</span>
                <strong>{status.deviceCase.isOpen ? '열림' : '닫힘'}</strong>
              </div>
              <div>
                <span>연결</span>
                <strong>{status.deviceCase.isConnected ? '정상' : '끊김'}</strong>
              </div>
            </div>
          ) : (
            <p className="empty-text">연결된 보관함 정보가 없습니다.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <ClipboardCheck size={19} />
            <h2>최근 탐활서</h2>
          </div>
          {status.latestActivityRequest ? (
            <article className="list-row">
              <div>
                <span className="row-meta">
                  {status.latestActivityRequest.location} ·{' '}
                  {new Date(status.latestActivityRequest.startsAt).toLocaleString('ko-KR')}
                </span>
                <h3>{status.latestActivityRequest.purpose}</h3>
                <p>
                  {status.latestActivityRequest.issuedNumber ?? status.latestActivityRequest.status}
                </p>
              </div>
              <span className="badge subtle">{status.latestActivityRequest.status}</span>
            </article>
          ) : (
            <p className="empty-text">최근 탐활서 신청이 없습니다.</p>
          )}
        </section>
      </div>
    </div>
  );
}
