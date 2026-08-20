import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type {
  DeviceCase,
  DeviceCaseCommand,
  DeviceCaseControlCommand,
  DeviceCaseSchedule,
} from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, History, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
  Dialog,
  AdminSelect,
  MobileSelectionActionBar,
  RowActionButton,
  RowActions,
  TableSummary,
  TableSelectionCheckbox,
  TableToolbar,
} from '../../components/ui';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';
import './device-cases.css';

const commandLabels: Record<DeviceCaseCommand['command'], string> = {
  open: '잠금 해제',
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
  return formatAdminDate(value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deviceCaseLabel(id: number) {
  const pairIndex = Math.floor((id - 1) / 2);
  const grade = Math.floor(pairIndex / 4) + 1;
  const classNo = (pairIndex % 4) + 1;
  return `${grade}-${classNo} (${id % 2 === 1 ? '상' : '하'})`;
}

export function DeviceCasesPage() {
  const [activeTab, setActiveTab] = useState<'cases' | 'schedules'>('cases');
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
  const schedulesQuery = useQuery({
    queryKey: ['device-case-schedules'],
    queryFn: api.deviceCaseSchedules,
  });
  const [scheduleDraft, setScheduleDraft] = useState({
    deviceCaseId: 1,
    scheduledAt: '',
    isOpen: false,
  });
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const scheduleMutation = useMutation({
    mutationFn: api.createDeviceCaseSchedule,
    onSuccess: async () => {
      setScheduleDraft((current) => ({ ...current, scheduledAt: '' }));
      setScheduleFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['device-case-schedules'] });
    },
  });
  const deleteScheduleMutation = useMutation({
    mutationFn: api.deleteDeviceCaseSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-case-schedules'] });
    },
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
      if (!window.confirm(`${deviceCaseLabel(deviceCase.id)} 보관함을 ${label} 처리하시겠습니까?`))
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
      if (!window.confirm(`${scope}을 ${label} 처리하시겠습니까?`)) return;
      bulkCommandMutation.mutate({ command, ids: ids.length ? ids : undefined });
    },
    [bulkCommandMutation, hasSelectedCases, selectedCaseIdsInList],
  );

  const renderCaseActions = useCallback(
    (deviceCase: DeviceCase) => (
      <RowActions mobileTitle={`${deviceCaseLabel(deviceCase.id)} 보관함`}>
        <RowActionButton
          icon={
            deviceCase.isOpen ? (
              <Lock size={14} aria-hidden="true" />
            ) : (
              <LockOpen size={14} aria-hidden="true" />
            )
          }
          label={`${deviceCaseLabel(deviceCase.id)} ${deviceCase.isOpen ? '잠금' : '잠금 해제'}`}
          mobileLabel={deviceCase.isOpen ? '잠금' : '잠금 해제'}
          variant="primary"
          onClick={() => runCaseCommand(deviceCase, deviceCase.isOpen ? 'close' : 'open')}
          disabled={isCommandPending}
        />
        <RowActionButton
          icon={<History size={14} aria-hidden="true" />}
          label={`${deviceCaseLabel(deviceCase.id)} 기록 보기`}
          mobileLabel="기록 보기"
          variant="secondary"
          onClick={() => setLogCaseId(deviceCase.id)}
        />
      </RowActions>
    ),
    [isCommandPending, runCaseCommand],
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
        meta: { align: 'center', widthPreset: 'selection', hideOnMobile: true },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        enableSorting: false,
        cell: ({ getValue }) => getValue<number>(),
        meta: { align: 'center', width: 64, hideOnMobile: true },
      },
      {
        id: 'deviceName',
        header: '디바이스명',
        enableSorting: false,
        cell: ({ row }) => deviceCaseLabel(row.original.id),
        meta: { align: 'center', width: 110, mobileRole: 'title' },
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
        meta: { align: 'center', width: 90, mobileRole: 'badge' },
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
        cell: ({ row }) => renderCaseActions(row.original),
        meta: { align: 'center', width: 92, mobileRole: 'actions' },
      },
    ],
    [cases, renderCaseActions, selectedCaseIdsInList, toggleAllCases, toggleCaseSelection],
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
      meta: { align: 'left', width: 130 },
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
        {casesQuery.isError ? (
          <p className="form-error">{describeAdminApiError(casesQuery.error, '휴대폰 보관함')}</p>
        ) : null}
        {commandError ? <p className="form-error">{commandError}</p> : null}
        <nav className="device-cases-tabs" aria-label="휴대폰 보관함 관리 메뉴">
          <button
            className={activeTab === 'cases' ? 'is-active' : undefined}
            type="button"
            onClick={() => setActiveTab('cases')}
          >
            보관함 관리
          </button>
          <button
            className={activeTab === 'schedules' ? 'is-active' : undefined}
            type="button"
            onClick={() => setActiveTab('schedules')}
          >
            <CalendarClock size={15} aria-hidden="true" /> cron 스케줄 관리
          </button>
        </nav>
        {activeTab === 'schedules' ? (
          <section className="device-schedule-panel" aria-labelledby="device-schedule-title">
            <header>
              <div>
                <h2 id="device-schedule-title">자동 잠금 일정</h2>
                <p>예약 시각이 되면 해당 보관함의 문 상태를 자동으로 변경합니다.</p>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setScheduleFormOpen((current) => !current)}
              >
                <Plus size={15} aria-hidden="true" /> 작업 추가
              </Button>
            </header>
            {scheduleFormOpen ? (
              <form
                className="device-schedule-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (!scheduleDraft.scheduledAt) return;
                  scheduleMutation.mutate(scheduleDraft);
                }}
              >
                <label>
                  <span>보관함</span>
                  <AdminSelect
                    aria-label="예약 보관함"
                    value={String(scheduleDraft.deviceCaseId)}
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        deviceCaseId: Number(event.target.value),
                      }))
                    }
                  >
                    {cases.map((deviceCase) => (
                      <option key={deviceCase.id} value={deviceCase.id}>
                        {deviceCaseLabel(deviceCase.id)}
                      </option>
                    ))}
                  </AdminSelect>
                </label>
                <label>
                  <span>동작</span>
                  <AdminSelect
                    aria-label="예약 동작"
                    value={scheduleDraft.isOpen ? 'open' : 'close'}
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        isOpen: event.target.value === 'open',
                      }))
                    }
                  >
                    <option value="close">잠금</option>
                    <option value="open">잠금 해제</option>
                  </AdminSelect>
                </label>
                <label>
                  <span>실행 시각</span>
                  <input
                    type="datetime-local"
                    value={scheduleDraft.scheduledAt}
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        scheduledAt: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <div className="device-schedule-form__actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setScheduleFormOpen(false)}
                  >
                    취소
                  </Button>
                  <Button type="submit" variant="primary" disabled={scheduleMutation.isPending}>
                    일정 추가
                  </Button>
                </div>
              </form>
            ) : null}
            {schedulesQuery.isError ? (
              <p className="form-error">스케줄을 불러오지 못했습니다.</p>
            ) : schedulesQuery.isPending ? (
              <div className="device-schedule-empty" aria-busy="true">
                <span className="admin-loading-spinner" aria-label="로딩 중" />
              </div>
            ) : schedulesQuery.data?.length ? (
              <div
                className="device-schedule-table"
                role="table"
                aria-label="등록된 자동 잠금 일정"
              >
                <div className="device-schedule-table__row is-header" role="row">
                  <span role="columnheader">보관함</span>
                  <span role="columnheader">동작</span>
                  <span role="columnheader">실행 시각</span>
                  <span role="columnheader" className="sr-only">
                    작업
                  </span>
                </div>
                {schedulesQuery.data.map((schedule: DeviceCaseSchedule) => (
                  <div className="device-schedule-table__row" role="row" key={schedule.id}>
                    <strong role="cell">{deviceCaseLabel(schedule.deviceCaseId)}</strong>
                    <span role="cell">{schedule.isOpen ? '잠금 해제' : '잠금'}</span>
                    <time role="cell" dateTime={schedule.scheduledAt}>
                      {formatDateTime(schedule.scheduledAt)}
                    </time>
                    <button
                      type="button"
                      className="icon-button quiet-button"
                      aria-label="예약 삭제"
                      onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                      disabled={deleteScheduleMutation.isPending}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="device-schedule-empty">등록된 자동 잠금 일정이 없습니다.</p>
            )}
          </section>
        ) : null}
        {activeTab === 'cases' ? (
          <>
            <TableToolbar
              summary={
                <>
                  <TableSummary count={cases.length} suffix="대" loading={casesQuery.isPending} />
                  {hasSelectedCases ? ` · 선택 ${selectedCount.toLocaleString('ko-KR')}대` : ''}
                </>
              }
              className={`device-cases-toolbar${hasSelectedCases ? ' has-selection' : ''}`}
              mobileSheet={false}
            ></TableToolbar>
            <MobileSelectionActionBar selectedCount={selectedCount}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runBulkCommand('open')}
                disabled={isCommandPending}
              >
                잠금 해제
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runBulkCommand('close')}
                disabled={isCommandPending}
              >
                잠금
              </Button>
            </MobileSelectionActionBar>
            <DataTable
              columns={caseColumns}
              data={cases}
              loading={casesQuery.isPending}
              emptyText="등록된 휴대폰 보관함이 없습니다."
              pageSize={casePageSize}
              onPageSizeChange={setCasePageSize}
              alwaysShowPagination
              mobileLoadMore
              caption="휴대폰 보관함 상태 목록"
              renderMobileRow={(deviceCase) => (
                <article className="device-mobile-card">
                  <header>
                    <TableSelectionCheckbox
                      label={`${deviceCaseLabel(deviceCase.id)} 선택`}
                      checked={selectedCaseIdsInList.has(deviceCase.id)}
                      disabled={isCommandPending}
                      onChange={(checked) => toggleCaseSelection(deviceCase.id, checked)}
                    />
                    <strong>{deviceCaseLabel(deviceCase.id)}</strong>
                    <span
                      className={`device-status ${
                        !deviceCase.isConnected || !deviceCase.isOpen ? 'danger' : 'success'
                      }`}
                    >
                      {!deviceCase.isConnected ? '연결 해제' : deviceCase.isOpen ? '열림' : '잠금'}
                    </span>
                    {renderCaseActions(deviceCase)}
                  </header>
                </article>
              )}
            />
          </>
        ) : null}
      </section>

      <Dialog
        open={Boolean(logCaseId)}
        onClose={() => setLogCaseId(null)}
        title={logCase ? `${deviceCaseLabel(logCase.id)} 명령 기록` : '명령 기록'}
        size="lg"
        className="device-command-dialog"
      >
        {commandsQuery.isError ? (
          <p className="form-error">
            {describeAdminApiError(commandsQuery.error, '보관함 명령 기록')}
          </p>
        ) : null}
        <TableToolbar
          summary={
            <TableSummary
              count={commandsQuery.data?.length}
              suffix="건"
              loading={commandsQuery.isPending && Boolean(logCaseId)}
            />
          }
          mobileSheet={false}
        ></TableToolbar>
        <DataTable
          columns={commandColumns}
          data={commandsQuery.data ?? []}
          loading={commandsQuery.isPending && Boolean(logCaseId)}
          emptyText="명령 기록이 없습니다."
          pageSize={commandPageSize}
          onPageSizeChange={setCommandPageSize}
          alwaysShowPagination
          caption="휴대폰 보관함 명령 기록"
        />
      </Dialog>
    </div>
  );
}
