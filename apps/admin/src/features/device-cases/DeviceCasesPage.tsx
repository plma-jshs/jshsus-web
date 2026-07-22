import { useCallback, useMemo, useState } from 'react';
import type { DeviceCase, DeviceCaseCommand, DeviceCaseControlCommand } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { History, Lock, LockOpen } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
  Dialog,
  PageSizeSelect,
  RowActionButton,
  RowActions,
  TableSelectionCheckbox,
  TableToolbar,
} from '../../components/ui';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import './device-cases.css';

const commandLabels: Record<DeviceCaseCommand['command'], string> = {
  open: '해제',
  close: '잠금',
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

function deviceCaseLabel(id: number) {
  const pairIndex = Math.floor((id - 1) / 2);
  const grade = Math.floor(pairIndex / 4) + 1;
  const classNo = (pairIndex % 4) + 1;
  return `${grade}-${classNo} (${id % 2 === 1 ? '상' : '하'})`;
}

export function DeviceCasesPage() {
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(() => new Set());
  const [logCaseId, setLogCaseId] = useState<number | null>(null);
  const [casePageSize, setCasePageSize] = useState(50);
  const [commandPageSize, setCommandPageSize] = useState(20);
  const [commandError, setCommandError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const casesQuery = useQuery({ queryKey: ['device-cases'], queryFn: api.deviceCases });
  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const logCase = useMemo(
    () => cases.find((deviceCase) => deviceCase.id === logCaseId),
    [cases, logCaseId],
  );
  const commandsQuery = useQuery({
    queryKey: ['device-case-commands', logCaseId],
    queryFn: () => api.deviceCaseCommands(logCaseId!),
    enabled: Boolean(logCaseId),
  });
  const caseIdSet = useMemo(() => new Set(cases.map((deviceCase) => deviceCase.id)), [cases]);
  const selectedCaseIdsInList = useMemo(
    () => new Set([...selectedCaseIds].filter((id) => caseIdSet.has(id))),
    [caseIdSet, selectedCaseIds],
  );
  const selectedCount = selectedCaseIdsInList.size;
  const hasSelectedCases = selectedCount > 0;

  const refreshDeviceCases = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['device-cases'] }),
      queryClient.invalidateQueries({ queryKey: ['device-case-commands'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-system-status'] }),
    ]);
  }, [queryClient]);
  const commandMutation = useMutation({
    mutationFn: (input: { command: DeviceCaseControlCommand; id: number }) =>
      api.deviceCaseCommand(input.id, input.command),
    onError: (error) => setCommandError(describeAdminApiError(error, '보관함 명령')),
    onSuccess: async () => {
      setCommandError(null);
      await refreshDeviceCases();
    },
  });
  const bulkCommandMutation = useMutation({
    mutationFn: api.deviceCaseBulkCommand,
    onError: (error) => setCommandError(describeAdminApiError(error, '보관함 명령')),
    onSuccess: async () => {
      setCommandError(null);
      setSelectedCaseIds(new Set());
      await refreshDeviceCases();
    },
  });
  const isCommandPending = commandMutation.isPending || bulkCommandMutation.isPending;

  const toggleCaseSelection = useCallback((id: number, checked: boolean) => {
    setSelectedCaseIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllCases = useCallback(
    (checked: boolean) => {
      setSelectedCaseIds(checked ? new Set(cases.map((deviceCase) => deviceCase.id)) : new Set());
    },
    [cases],
  );

  const runCaseCommand = useCallback(
    (deviceCase: DeviceCase, command: DeviceCaseControlCommand) => {
      const label = commandLabels[command];
      if (!window.confirm(`${deviceCaseLabel(deviceCase.id)} 보관함을 ${label} 처리할까요?`))
        return;
      commandMutation.mutate({ command, id: deviceCase.id });
    },
    [commandMutation],
  );
  const runBulkCommand = useCallback(
    (command: DeviceCaseControlCommand) => {
      const ids = hasSelectedCases
        ? [...selectedCaseIdsInList].sort((left, right) => left - right)
        : [];
      const scope = hasSelectedCases ? `선택한 ${ids.length}개 보관함` : '전체 휴대폰 보관함';
      const label = commandLabels[command];
      if (!window.confirm(`${scope}을 ${label} 처리할까요?`)) return;
      bulkCommandMutation.mutate({ command, ids: ids.length ? ids : undefined });
    },
    [bulkCommandMutation, hasSelectedCases, selectedCaseIdsInList],
  );

  const caseColumns = useMemo<ColumnDef<DeviceCase>[]>(
    () => [
      {
        id: 'selection',
        header: () => (
          <TableSelectionCheckbox
            checked={cases.length > 0 && selectedCaseIdsInList.size === cases.length}
            indeterminate={
              selectedCaseIdsInList.size > 0 && selectedCaseIdsInList.size < cases.length
            }
            label="전체 보관함 선택"
            onChange={toggleAllCases}
          />
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <TableSelectionCheckbox
            checked={selectedCaseIdsInList.has(row.original.id)}
            label={`${deviceCaseLabel(row.original.id)} 선택`}
            onChange={(checked) => toggleCaseSelection(row.original.id, checked)}
          />
        ),
        meta: { align: 'center', widthPreset: 'selection' },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        enableSorting: false,
        cell: ({ getValue }) => getValue<number>(),
        meta: { align: 'center', width: 64 },
      },
      {
        id: 'deviceName',
        header: '디바이스명',
        enableSorting: false,
        cell: ({ row }) => deviceCaseLabel(row.original.id),
        meta: { align: 'center', width: 110 },
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
        cell: ({ getValue }) => (getValue<boolean>() ? '열림' : '잠김'),
        meta: { align: 'center', width: 90 },
      },
      {
        accessorKey: 'lastSeenAt',
        header: '마지막 동기화',
        enableSorting: false,
        cell: ({ getValue }) => formatDateTime(getValue<string>()),
        meta: { align: 'center', width: 170 },
      },
      {
        id: 'actions',
        header: '작업',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={
                row.original.isOpen ? (
                  <Lock size={14} aria-hidden="true" />
                ) : (
                  <LockOpen size={14} aria-hidden="true" />
                )
              }
              label={`${deviceCaseLabel(row.original.id)} ${row.original.isOpen ? '잠금' : '해제'}`}
              variant="primary"
              onClick={() => runCaseCommand(row.original, row.original.isOpen ? 'close' : 'open')}
              disabled={isCommandPending}
            />
            <RowActionButton
              icon={<History size={14} aria-hidden="true" />}
              label={`${deviceCaseLabel(row.original.id)} 기록 보기`}
              variant="secondary"
              onClick={() => setLogCaseId(row.original.id)}
            />
          </RowActions>
        ),
        meta: { align: 'center', width: 92 },
      },
    ],
    [
      cases,
      isCommandPending,
      runCaseCommand,
      selectedCaseIdsInList,
      toggleAllCases,
      toggleCaseSelection,
    ],
  );

  const commandColumns: ColumnDef<DeviceCaseCommand>[] = [
    {
      accessorKey: 'command',
      header: '명령',
      enableSorting: false,
      cell: ({ getValue }) => commandLabels[getValue<DeviceCaseCommand['command']>()],
      meta: { align: 'center', width: 90 },
    },
    {
      accessorKey: 'actorName',
      header: '실행자',
      enableSorting: false,
      meta: { align: 'center', width: 130 },
    },
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
      enableSorting: false,
      cell: ({ getValue }) => formatDateTime(getValue<string>()),
      meta: { align: 'center', width: 170 },
    },
  ];

  return (
    <div className="admin-stack device-cases-page">
      <section className="admin-panel">
        <div className="panel-title">
          <h2>휴대폰 보관함</h2>
        </div>
        {casesQuery.isError ? (
          <p className="form-error">{describeAdminApiError(casesQuery.error, '휴대폰 보관함')}</p>
        ) : null}
        {commandError ? <p className="form-error">{commandError}</p> : null}
        <TableToolbar
          summary={`총 ${cases.length.toLocaleString('ko-KR')}대${
            hasSelectedCases ? ` · 선택 ${selectedCount.toLocaleString('ko-KR')}대` : ''
          }`}
        >
          <div className="device-control-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => runBulkCommand('open')}
              disabled={isCommandPending || cases.length === 0}
            >
              {hasSelectedCases ? '선택 해제' : '전체 해제'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runBulkCommand('close')}
              disabled={isCommandPending || cases.length === 0}
            >
              {hasSelectedCases ? '선택 잠금' : '전체 잠금'}
            </Button>
          </div>
          <PageSizeSelect value={casePageSize} onChange={setCasePageSize} />
        </TableToolbar>
        <DataTable
          columns={caseColumns}
          data={cases}
          loading={casesQuery.isPending}
          loadingText="보관함 상태를 불러오는 중입니다."
          emptyText="등록된 휴대폰 보관함이 없습니다."
          pageSize={casePageSize}
          alwaysShowPagination
          caption="휴대폰 보관함 상태 목록"
        />
      </section>

      <Dialog
        open={Boolean(logCaseId)}
        onClose={() => setLogCaseId(null)}
        title={logCase ? `${deviceCaseLabel(logCase.id)} 명령 기록` : '명령 기록'}
        size="lg"
      >
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
          loading={commandsQuery.isPending && Boolean(logCaseId)}
          loadingText="명령 기록을 불러오는 중입니다."
          emptyText="명령 기록이 없습니다."
          pageSize={commandPageSize}
          alwaysShowPagination
          caption="휴대폰 보관함 명령 기록"
        />
      </Dialog>
    </div>
  );
}
