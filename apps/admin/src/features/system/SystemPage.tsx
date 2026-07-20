import { useQuery } from '@tanstack/react-query';
import { Activity, Database, History, RefreshCw, Server, Smartphone } from 'lucide-react';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import './system.css';

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(new Date(value))
    .replace(/\.$/, '');
}

function optionalDate(value?: string) {
  return value ? formatCheckedAt(value) : '기록 없음';
}

export function SystemPage() {
  const systemStatusQuery = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: api.systemStatus,
    refetchInterval: 30_000,
  });
  const systemStatus = systemStatusQuery.data;
  const healthy =
    systemStatus?.api.status === 'ok' &&
    systemStatus.database.status === 'ok' &&
    systemStatus.deviceCases.status === 'ok';

  return (
    <section className="admin-panel system-status-panel">
      <div className="panel-title system-status-heading">
        <div className="panel-title-copy">
          <span className="system-status-icon" aria-hidden="true">
            <Server size={18} />
          </span>
          <div>
            <h2>서비스 상태</h2>
            <span className={`system-status-badge ${healthy ? 'healthy' : 'unhealthy'}`}>
              {healthy ? '정상' : systemStatusQuery.isLoading ? '확인 중' : '점검 필요'}
            </span>
          </div>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => systemStatusQuery.refetch()}
          disabled={systemStatusQuery.isFetching}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {systemStatusQuery.isFetching ? '확인 중' : '새로고침'}
        </button>
      </div>
      {systemStatusQuery.isError ? (
        <p className="form-error">
          {describeAdminApiError(systemStatusQuery.error, '시스템 상태')}
        </p>
      ) : systemStatus ? (
        <div className="system-status-stack">
          <div className="metric-grid system-health-grid">
            <article className="metric-card">
              <Activity size={20} />
              <span>API</span>
              <strong>정상</strong>
            </article>
            <article className="metric-card">
              <Database size={20} />
              <span>DB</span>
              <strong>정상</strong>
            </article>
            <article
              className={`metric-card${
                systemStatus.deviceCases.status === 'warning' ? ' is-warning' : ''
              }`}
            >
              <Smartphone size={20} />
              <span>휴대폰 보관함</span>
              <strong>
                {systemStatus.deviceCases.connected}/{systemStatus.deviceCases.total}대
              </strong>
              <small>
                {systemStatus.deviceCases.disconnected > 0
                  ? `미연결 ${systemStatus.deviceCases.disconnected}대`
                  : '모두 연결됨'}
              </small>
            </article>
            <article className="metric-card">
              <History size={20} />
              <span>최근 관리자 작업</span>
              <strong>{systemStatus.audit.latestAction ?? '기록 없음'}</strong>
            </article>
          </div>
          <dl className="system-detail-list">
            <div>
              <dt>서비스</dt>
              <dd>{systemStatus.api.service}</dd>
            </div>
            <div>
              <dt>확인 시각</dt>
              <dd>{formatCheckedAt(systemStatus.checkedAt)}</dd>
            </div>
            <div>
              <dt>DB 확인</dt>
              <dd>{formatCheckedAt(systemStatus.database.checkedAt)}</dd>
            </div>
            <div>
              <dt>보관함 마지막 신호</dt>
              <dd>{optionalDate(systemStatus.deviceCases.lastSeenAt)}</dd>
            </div>
            <div>
              <dt>최근 작업자</dt>
              <dd>{systemStatus.audit.latestActorName ?? 'system'}</dd>
            </div>
            <div>
              <dt>최근 작업 시각</dt>
              <dd>{optionalDate(systemStatus.audit.latestAt)}</dd>
            </div>
            <div>
              <dt>최근 데이터 작업</dt>
              <dd>{systemStatus.dataOperations.latestAction ?? '기록 없음'}</dd>
            </div>
            <div>
              <dt>데이터 작업 시각</dt>
              <dd>{optionalDate(systemStatus.dataOperations.latestAt)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="system-status-loading">상태를 확인하는 중입니다.</p>
      )}
    </section>
  );
}
