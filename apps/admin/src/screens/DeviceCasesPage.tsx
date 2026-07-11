import { useMemo, useState } from 'react';
import type { DeviceCase, DeviceCaseCommand } from '@jshsus/types';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/DataTable';
import { api } from '../lib/api';

const commandLabels: Record<DeviceCaseCommand['command'], string> = {
  open: '열기',
  close: '닫기',
  sync: '동기화',
};

export function DeviceCasesPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const casesQuery = useQuery({ queryKey: ['device-cases'], queryFn: api.deviceCases });
  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const activeCaseId = selectedCaseId ?? cases[0]?.id ?? null;
  const activeCase = useMemo(
    () => cases.find((deviceCase) => deviceCase.id === activeCaseId) ?? cases[0],
    [activeCaseId, cases],
  );
  const commandsQuery = useQuery({
    queryKey: ['device-case-commands', activeCase?.id],
    queryFn: () => api.deviceCaseCommands(activeCase!.id),
    enabled: Boolean(activeCase?.id),
  });

  const columns: ColumnDef<DeviceCase>[] = [
    { accessorKey: 'id', header: '보관함' },
    {
      accessorKey: 'isConnected',
      header: '연결',
      cell: ({ getValue }) => (getValue<boolean>() ? '정상' : '끊김'),
    },
    {
      accessorKey: 'isOpen',
      header: '상태',
      cell: ({ getValue }) => (getValue<boolean>() ? '열림' : '닫힘'),
    },
    {
      accessorKey: 'lastSeenAt',
      header: '마지막 동기화',
      cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString('ko-KR'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          className="table-action"
          type="button"
          onClick={() => setSelectedCaseId(row.original.id)}
        >
          명령 기록
        </button>
      ),
    },
  ];

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <h2>스마트폰 보관함</h2>
            <p className="empty-text">
              장치 게이트웨이가 연결되기 전까지 상태와 기존 명령 기록만 조회할 수 있습니다.
            </p>
          </div>
        </div>
        <DataTable columns={columns} data={cases} />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>{activeCase ? `${activeCase.id}번 보관함 명령 기록` : '보관함 명령 기록'}</h2>
        </div>
        <div className="command-list">
          {(commandsQuery.data ?? []).map((command) => (
            <article key={command.id} className="command-row">
              <div>
                <strong>{commandLabels[command.command]}</strong>
                <span>
                  {command.actorName} · {new Date(command.createdAt).toLocaleString('ko-KR')}
                </span>
              </div>
              <em>{command.status}</em>
            </article>
          ))}
          {!commandsQuery.isLoading && (commandsQuery.data ?? []).length === 0 ? (
            <p className="empty-text">명령 기록이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
