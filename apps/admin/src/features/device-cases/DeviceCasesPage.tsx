import { useMemo, useState } from 'react';
import type { DeviceCase, DeviceCaseCommand } from '@jshsus/types';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/DataTable';
import { PageSizeSelect, TableToolbar } from '../../components/ui';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import './device-cases.css';

const commandLabels: Record<DeviceCaseCommand['command'], string> = {
  open: '열기',
  close: '닫기',
  sync: '동기화',
};

const commandStatusLabels: Record<DeviceCaseCommand['status'], string> = {
  queued: '대기',
  sent: '전송',
  succeeded: '완료',
  failed: '실패',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(/\.$/, '');
}

export function DeviceCasesPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [commandPageSize, setCommandPageSize] = useState(20);
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

  const caseColumns = useMemo<ColumnDef<DeviceCase>[]>(
    () => [
      {
        accessorKey: 'id',
        header: '보관함',
        cell: ({ getValue }) => `${getValue<number>()}번`,
        meta: { align: 'center', width: 90 },
      },
      {
        accessorKey: 'isConnected',
        header: '연결',
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className={`device-status ${getValue<boolean>() ? 'success' : 'danger'}`}>
            {getValue<boolean>() ? '정상' : '끊김'}
          </span>
        ),
        meta: { align: 'center', width: 90 },
      },
      {
        accessorKey: 'isOpen',
        header: '문 상태',
        enableSorting: false,
        cell: ({ getValue }) => (getValue<boolean>() ? '열림' : '닫힘'),
        meta: { align: 'center', width: 90 },
      },
      {
        accessorKey: 'lastSeenAt',
        header: '마지막 동기화',
        cell: ({ getValue }) => formatDateTime(getValue<string>()),
        meta: { align: 'center', width: 170 },
      },
      {
        id: 'actions',
        header: '작업',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            className={row.original.id === activeCaseId ? 'table-action active' : 'table-action'}
            type="button"
            onClick={() => setSelectedCaseId(row.original.id)}
          >
            기록 보기
          </button>
        ),
        meta: { align: 'center', widthPreset: 'action' },
      },
    ],
    [activeCaseId],
  );

  const commandColumns: ColumnDef<DeviceCaseCommand>[] = [
    {
      accessorKey: 'command',
      header: '명령',
      enableSorting: false,
      cell: ({ getValue }) => commandLabels[getValue<DeviceCaseCommand['command']>()],
      meta: { align: 'center', width: 90 },
    },
    { accessorKey: 'actorName', header: '실행자', meta: { align: 'center', width: 130 } },
    {
      accessorKey: 'status',
      header: '상태',
      enableSorting: false,
      cell: ({ getValue }) => {
        const status = getValue<DeviceCaseCommand['status']>();
        return (
          <span className={`device-status ${status === 'failed' ? 'danger' : 'success'}`}>
            {commandStatusLabels[status]}
          </span>
        );
      },
      meta: { align: 'center', widthPreset: 'status' },
    },
    {
      accessorKey: 'createdAt',
      header: '실행 시각',
      cell: ({ getValue }) => formatDateTime(getValue<string>()),
      meta: { align: 'center', width: 170 },
    },
  ];

  return (
    <div className="admin-stack device-cases-page">
      <section className="admin-panel">
        <div className="panel-title">
          <h2>휴대폰 보관함</h2>
          <span className="device-list-count">{cases.length.toLocaleString('ko-KR')}대</span>
        </div>
        {casesQuery.isError ? (
          <p className="form-error">{describeAdminApiError(casesQuery.error, '휴대폰 보관함')}</p>
        ) : null}
        <DataTable
          columns={caseColumns}
          data={cases}
          loading={casesQuery.isPending}
          loadingText="보관함 상태를 불러오는 중입니다."
          emptyText="등록된 휴대폰 보관함이 없습니다."
          caption="휴대폰 보관함 상태 목록"
        />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>{activeCase ? `${activeCase.id}번 보관함 명령 기록` : '명령 기록'}</h2>
        </div>
        {commandsQuery.isError ? (
          <p className="form-error">
            {describeAdminApiError(commandsQuery.error, '보관함 명령 기록')}
          </p>
        ) : null}
        <TableToolbar summary={`총 ${commandsQuery.data?.length ?? 0}건`}>
          <PageSizeSelect value={commandPageSize} onChange={setCommandPageSize} />
        </TableToolbar>
        <DataTable
          columns={commandColumns}
          data={commandsQuery.data ?? []}
          loading={commandsQuery.isPending && Boolean(activeCase)}
          loadingText="명령 기록을 불러오는 중입니다."
          emptyText={activeCase ? '명령 기록이 없습니다.' : '보관함을 선택해 주세요.'}
          pageSize={commandPageSize}
          alwaysShowPagination
          caption="휴대폰 보관함 명령 기록"
        />
      </section>
    </div>
  );
}
