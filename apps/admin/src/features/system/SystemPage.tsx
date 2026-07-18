import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Server } from 'lucide-react';
import './system.css';

type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
};

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

async function getSystemHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('서비스 상태를 확인하지 못했습니다.');
  return response.json() as Promise<HealthResponse>;
}

export function SystemPage() {
  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });
  const healthy = healthQuery.data?.status === 'ok';

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
              {healthy ? '정상' : healthQuery.isLoading ? '확인 중' : '점검 필요'}
            </span>
          </div>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => healthQuery.refetch()}
          disabled={healthQuery.isFetching}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {healthQuery.isFetching ? '확인 중' : '새로고침'}
        </button>
      </div>
      {healthQuery.isError ? (
        <p className="form-error">{healthQuery.error.message}</p>
      ) : healthQuery.data ? (
        <dl className="system-detail-list">
          <div>
            <dt>서비스</dt>
            <dd>{healthQuery.data.service}</dd>
          </div>
          <div>
            <dt>확인 시각</dt>
            <dd>{formatCheckedAt(healthQuery.data.timestamp)}</dd>
          </div>
        </dl>
      ) : (
        <p className="system-status-loading">상태를 확인하는 중입니다.</p>
      )}
    </section>
  );
}
