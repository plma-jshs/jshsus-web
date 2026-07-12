import type { ActivityRequestStatus } from '@jshsus/types';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, BedDouble, ClipboardCheck, Smartphone, UserRound } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import { getMyStatus } from '../../lib/api';

const activityStatusLabels: Record<ActivityRequestStatus, string> = {
  draft: '임시저장',
  submitted: '승인 대기',
  approved: '승인',
  rejected: '반려',
  canceled: '취소',
  completed: '완료',
};

const activityStatusTones: Record<
  ActivityRequestStatus,
  'brand' | 'neutral' | 'positive' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'brand',
  rejected: 'danger',
  canceled: 'neutral',
  completed: 'positive',
};

const statusDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function MyStatusPage() {
  const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getMyStatus });

  if (statusQuery.isLoading) {
    return (
      <div className="portal-page portal-page--state">
        <PageHeader
          eyebrow="학교생활"
          title="내 상태"
          description="개인별 학교생활 정보를 확인하세요."
        />
        <Panel title="내 정보" icon={UserRound}>
          <StateMessage kind="loading" title="내 상태를 불러오고 있습니다." />
        </Panel>
      </div>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className="portal-page portal-page--state">
        <PageHeader
          eyebrow="학교생활"
          title="내 상태"
          description="개인별 학교생활 정보를 확인하세요."
        />
        <Panel title="내 정보" icon={UserRound}>
          <StateMessage
            kind="error"
            title="내 상태를 불러오지 못했습니다."
            description="로그인 상태를 확인한 뒤 다시 시도해 주세요."
            action={
              <button
                className="portal-button portal-button--secondary"
                type="button"
                onClick={() => void statusQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        </Panel>
      </div>
    );
  }

  const status = statusQuery.data;
  const studentLabel = `${status.student.grade}학년 ${status.student.classNo}반 ${status.student.number}번`;

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="학교생활"
        title={`${status.student.name} 학생`}
        description={`${studentLabel} · 학번 ${status.student.studentNo}`}
        stat={{ icon: BadgeCheck, label: '현재 상벌점', value: `${status.points.currentPoint}점` }}
      />

      <section className="stat-grid" aria-label="학생 생활 요약">
        <article className="stat-card stat-card--positive">
          <span className="stat-card__label">상점 합계</span>
          <strong className="stat-card__value">+{status.points.meritPoint}점</strong>
          <span className="stat-card__description">누적 상점</span>
        </article>
        <article className="stat-card stat-card--danger">
          <span className="stat-card__label">벌점 합계</span>
          <strong className="stat-card__value">{status.points.penaltyPoint}점</strong>
          <span className="stat-card__description">누적 벌점</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">기숙사 배정</span>
          <strong className="stat-card__value stat-card__value--text">
            {status.dorm ? `${status.dorm.dormName} ${status.dorm.roomName}` : '미배정'}
          </strong>
          <span className="stat-card__description">
            {status.dorm ? `${status.dorm.bedPosition}번 침대` : '배정 정보 없음'}
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">스마트폰 보관함</span>
          <strong className="stat-card__value stat-card__value--text">
            {status.deviceCase ? `${status.deviceCase.id}번` : '미연결'}
          </strong>
          <span className="stat-card__description">
            {status.deviceCase
              ? `${status.deviceCase.isOpen ? '열림' : '닫힘'} · ${status.deviceCase.isConnected ? '연결 정상' : '연결 끊김'}`
              : '연결 정보 없음'}
          </span>
        </article>
      </section>

      <Panel
        title="최근 상벌점"
        description="최근 등록된 상점과 벌점 내역입니다."
        icon={BadgeCheck}
        action={<span className="portal-panel__count">총 {status.points.records.length}건</span>}
      >
        {status.points.records.length === 0 ? (
          <StateMessage kind="empty" title="상벌점 기록이 없습니다." />
        ) : (
          <div className="item-list">
            {status.points.records.map((record) => (
              <article className="item-card point-record" key={record.id}>
                <div className="item-card__main">
                  <div className="item-card__meta">
                    <time dateTime={record.baseDate}>{record.baseDate}</time>
                    <span aria-hidden="true">·</span>
                    <span>{record.teacherName} 선생님</span>
                  </div>
                  <h3 className="item-card__title">{record.reason}</h3>
                  {record.comment ? <p className="item-card__content">{record.comment}</p> : null}
                </div>
                <div className="item-card__aside">
                  <StatusBadge tone={record.point > 0 ? 'positive' : 'danger'}>
                    {record.point > 0 ? `+${record.point}` : record.point}점
                  </StatusBadge>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="portal-grid portal-grid--two">
        <Panel title="기숙사" icon={BedDouble}>
          {status.dorm ? (
            <dl className="detail-list">
              <div className="detail-row">
                <dt>배정 방</dt>
                <dd>
                  {status.dorm.dormName} {status.dorm.roomName}
                </dd>
              </div>
              <div className="detail-row">
                <dt>적용 학기</dt>
                <dd>
                  {status.dorm.year}년 {status.dorm.semester}학기
                </dd>
              </div>
              <div className="detail-row">
                <dt>침대 위치</dt>
                <dd>{status.dorm.bedPosition}번</dd>
              </div>
            </dl>
          ) : (
            <StateMessage kind="empty" title="기숙사 배정 정보가 없습니다." compact />
          )}
        </Panel>

        <Panel title="스마트폰 보관함" icon={Smartphone}>
          {status.deviceCase ? (
            <dl className="detail-list">
              <div className="detail-row">
                <dt>보관함 번호</dt>
                <dd>{status.deviceCase.id}번</dd>
              </div>
              <div className="detail-row">
                <dt>문 상태</dt>
                <dd>
                  <StatusBadge tone={status.deviceCase.isOpen ? 'warning' : 'positive'}>
                    {status.deviceCase.isOpen ? '열림' : '닫힘'}
                  </StatusBadge>
                </dd>
              </div>
              <div className="detail-row">
                <dt>기기 연결</dt>
                <dd>
                  <StatusBadge tone={status.deviceCase.isConnected ? 'positive' : 'danger'}>
                    {status.deviceCase.isConnected ? '정상' : '끊김'}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
          ) : (
            <StateMessage kind="empty" title="연결된 보관함 정보가 없습니다." compact />
          )}
        </Panel>

        <Panel
          title="최근 탐구활동서"
          description="가장 최근에 신청한 탐구활동서입니다."
          icon={ClipboardCheck}
          className="portal-panel--wide"
        >
          {status.latestActivityRequest ? (
            <article className="item-card activity-card">
              <div className="item-card__main">
                <div className="item-card__meta">
                  <StatusBadge tone={activityStatusTones[status.latestActivityRequest.status]}>
                    {activityStatusLabels[status.latestActivityRequest.status]}
                  </StatusBadge>
                  <span>{status.latestActivityRequest.location}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={status.latestActivityRequest.startsAt}>
                    {statusDateFormatter.format(new Date(status.latestActivityRequest.startsAt))}
                  </time>
                </div>
                <h3 className="item-card__title">{status.latestActivityRequest.purpose}</h3>
                {status.latestActivityRequest.issuedNumber ? (
                  <p className="issuance-number">
                    발급번호 <strong>{status.latestActivityRequest.issuedNumber}</strong>
                  </p>
                ) : null}
                {status.latestActivityRequest.rejectionReason ? (
                  <p className="item-card__notice item-card__notice--danger">
                    반려 사유: {status.latestActivityRequest.rejectionReason}
                  </p>
                ) : null}
              </div>
            </article>
          ) : (
            <StateMessage kind="empty" title="최근 탐구활동서 신청이 없습니다." compact />
          )}
        </Panel>
      </div>
    </div>
  );
}
