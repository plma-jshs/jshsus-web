import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CircleCheck,
  Database,
  Globe2,
  RefreshCw,
  Server,
  Users,
} from 'lucide-react';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';
import './system.css';

function formatCheckedAt(value: string) {
  return formatAdminDate(value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
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
    systemStatus.processes.every((process) => process.status === 'running');

  return (
    <section className="admin-panel system-status-panel" aria-labelledby="system-status-title">
      <div className="panel-title system-status-heading">
        <div className="panel-title-copy">
          <div>
            <h2 id="system-status-title" className="sr-only">
              시스템 상태
            </h2>
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
              <span>24시간 요청</span>
              <strong>{systemStatus.traffic.requests24h.toLocaleString()}건</strong>
            </article>
            <article
              className={`metric-card${systemStatus.traffic.serverErrors24h ? ' is-danger' : ''}`}
            >
              <AlertTriangle size={20} />
              <span>24시간 500번대 오류</span>
              <strong>{systemStatus.traffic.serverErrors24h.toLocaleString()}건</strong>
            </article>
            <article className="metric-card">
              <Users size={20} />
              <span>오늘 로그인 학생</span>
              <strong>{systemStatus.traffic.studentsLoggedInToday.toLocaleString()}명</strong>
            </article>
            <article
              className={`metric-card${
                systemStatus.deviceCases.status === 'warning' ? ' is-warning' : ''
              }`}
            >
              <Database size={20} />
              <span>휴대폰 보관함</span>
              <strong>
                {systemStatus.deviceCases.connected}/{systemStatus.deviceCases.total}대
              </strong>
            </article>
          </div>

          <div className="system-status-columns">
            <section className="system-status-group">
              <h3>
                <Server size={17} /> 핵심 프로세스
              </h3>
              <ul>
                {systemStatus.processes.map((process) => (
                  <li key={process.key}>
                    <span>{process.label}</span>
                    <strong className={process.status === 'running' ? 'is-running' : 'is-stopped'}>
                      {process.status === 'running' ? 'Running' : 'Stopped'}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className="system-status-group">
              <h3>
                <Globe2 size={17} /> 외부 서비스
              </h3>
              <ul>
                {systemStatus.integrations.map((integration) => (
                  <li key={integration.key}>
                    <span>{integration.label}</span>
                    <strong
                      className={integration.status === 'configured' ? 'is-running' : 'is-stopped'}
                    >
                      {integration.status === 'configured' ? (
                        <>
                          <CircleCheck size={14} /> 설정됨
                        </>
                      ) : (
                        '미설정'
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
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
              <dt>프로세스 시작</dt>
              <dd>{formatCheckedAt(systemStatus.traffic.processStartedAt)}</dd>
            </div>
          </dl>
          <p className="system-metrics-note">
            트래픽과 오류 수는 현재 API 프로세스가 수집한 최근 24시간 기준입니다.
          </p>
        </div>
      ) : (
        <p className="system-status-loading">상태를 확인하는 중입니다.</p>
      )}
    </section>
  );
}
