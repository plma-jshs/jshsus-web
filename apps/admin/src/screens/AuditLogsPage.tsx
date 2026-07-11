import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AdminAuditLog } from '@jshsus/types';
import { ScrollText } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { api } from '../lib/api';

const columns: ColumnDef<AdminAuditLog>[] = [
  { accessorKey: 'createdAt', header: '시간' },
  { accessorKey: 'actorName', header: '수행자' },
  { accessorKey: 'action', header: '동작' },
  { accessorKey: 'targetType', header: '대상' },
  { accessorKey: 'targetId', header: '대상 ID' },
];

export function AuditLogsPage() {
  const logsQuery = useQuery({ queryKey: ['audit-logs'], queryFn: api.auditLogs });
  const data = (logsQuery.data ?? []).map((log) => ({
    ...log,
    createdAt: new Date(log.createdAt).toLocaleString('ko-KR'),
  }));

  return (
    <div className="admin-stack">
      <section className="metric-grid compact">
        <article className="metric-card">
          <ScrollText size={20} />
          <span>최근 감사 로그</span>
          <strong>{data.length}</strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>감사 로그</h2>
        </div>
        {logsQuery.isError ? (
          <p className="form-error">감사 로그 API 연결을 확인해주세요.</p>
        ) : null}
        <DataTable columns={columns} data={data} />
      </section>
    </div>
  );
}
