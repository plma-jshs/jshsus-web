import { useMemo, useState } from 'react';
import type { DormRoom, DormRoomResident, PointReason } from '@jshsus/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
  PageSizeSelect,
  RowActionButton,
  RowActions,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { pointsApi } from '../points/pointsApi';

type QueueRow = DormRoomResident & {
  reasonId: number;
  point: number;
  reasonText: string;
};

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function roomLabel(room: DormRoom) {
  return `${room.dormName} ${room.name}`;
}

export function DormRoomPointsPanel({ rooms }: { rooms: DormRoom[] }) {
  const { showToast } = useToast();
  const reasonsQuery = useQuery({
    queryKey: ['point-reasons', 'dorm'],
    queryFn: pointsApi.reasons,
  });
  const reasons = reasonsQuery.data ?? [];
  const [roomInput, setRoomInput] = useState('');
  const [reasonId, setReasonId] = useState(0);
  const [point, setPoint] = useState(0);
  const [reasonText, setReasonText] = useState('');
  const [baseDate, setBaseDate] = useState(todayValue);
  const [pageSize, setPageSize] = useState(20);
  const [queue, setQueue] = useState<QueueRow[]>([]);

  const selectReason = (id: number) => {
    const reason = reasons.find((item) => item.id === id);
    setReasonId(id);
    if (!reason) return;
    setPoint(reason.point);
    setReasonText(reason.comment);
    setQueue((current) =>
      current.map((row) => ({
        ...row,
        reasonId: reason.id,
        point: reason.point,
        reasonText: reason.comment,
      })),
    );
  };
  const addRoom = () => {
    const room = rooms.find((item) => roomLabel(item) === roomInput);
    if (!room) {
      showToast({ title: '목록에서 방을 선택해 주세요.', tone: 'warning' });
      return;
    }
    setQueue((current) => {
      const currentIds = new Set(current.map((row) => row.userId));
      return [
        ...current,
        ...(room.residents ?? [])
          .filter((resident) => !currentIds.has(resident.userId))
          .map((resident) => ({ ...resident, reasonId, point, reasonText })),
      ];
    });
  };
  const applyMutation = useMutation({
    mutationFn: () =>
      pointsApi.createRecordBatch({
        idempotencyKey: crypto.randomUUID(),
        records: queue.map((row) => ({
          studentId: row.studentId,
          reasonId: row.reasonId,
          point: row.point,
          reasonText: row.reasonText.trim(),
          baseDate,
        })),
      }),
    onSuccess: () => {
      showToast({ title: `${queue.length}명에게 상벌점을 적용했습니다.`, tone: 'success' });
      setQueue([]);
    },
    onError: (error) =>
      showToast({
        title: '상벌점을 적용하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });

  const columns = useMemo<ColumnDef<QueueRow>[]>(
    () => [
      {
        id: 'number',
        header: '번호',
        cell: ({ row }) => row.index + 1,
        enableSorting: false,
        meta: { width: 70, align: 'center' },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: false,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'studentName',
        header: '이름',
        enableSorting: false,
        meta: { width: 120, align: 'center' },
      },
      {
        id: 'point',
        header: '점수',
        cell: ({ row }) => (
          <input
            className="dorm-point-input"
            type="number"
            value={row.original.point}
            onChange={(event) =>
              setQueue((current) =>
                current.map((item) =>
                  item.userId === row.original.userId
                    ? { ...item, point: Number(event.target.value) }
                    : item,
                ),
              )
            }
          />
        ),
        enableSorting: false,
        meta: { width: 110, align: 'center' },
      },
      {
        id: 'reason',
        header: '사유',
        cell: ({ row }) => (
          <input
            value={row.original.reasonText}
            onChange={(event) =>
              setQueue((current) =>
                current.map((item) =>
                  item.userId === row.original.userId
                    ? { ...item, reasonText: event.target.value }
                    : item,
                ),
              )
            }
          />
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={<X aria-hidden="true" />}
              label={`${row.original.studentName} 제외`}
              onClick={() =>
                setQueue((current) => current.filter((item) => item.userId !== row.original.userId))
              }
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { width: 64, align: 'center' },
      },
    ],
    [],
  );

  const canApply =
    queue.length > 0 && queue.every((row) => row.reasonId > 0 && row.reasonText.trim());

  return (
    <section className="admin-panel">
      <div className="panel-title">
        <h2>방 상벌점 부여</h2>
      </div>
      <div className="dorm-room-point-form">
        <label>
          방
          <input
            list="dorm-point-rooms"
            value={roomInput}
            onChange={(event) => setRoomInput(event.target.value)}
            placeholder="생활관 또는 호실 검색"
          />
        </label>
        <datalist id="dorm-point-rooms">
          {rooms.map((room) => (
            <option key={room.id} value={roomLabel(room)} />
          ))}
        </datalist>
        <Button onClick={addRoom}>추가</Button>
        <label>
          기준 규정
          <select value={reasonId} onChange={(event) => selectReason(Number(event.target.value))}>
            <option value={0}>선택</option>
            {reasons.map((reason: PointReason) => (
              <option key={reason.id} value={reason.id}>
                [{reason.id}] {reason.comment} ({reason.point > 0 ? '+' : ''}
                {reason.point})
              </option>
            ))}
          </select>
        </label>
        <label>
          점수
          <input
            type="number"
            value={point}
            onChange={(event) => {
              const value = Number(event.target.value);
              setPoint(value);
              setQueue((current) => current.map((row) => ({ ...row, point: value })));
            }}
          />
        </label>
        <label>
          기준일
          <input
            type="date"
            value={baseDate}
            onChange={(event) => setBaseDate(event.target.value)}
          />
        </label>
        <label className="dorm-point-reason">
          사유
          <input
            value={reasonText}
            onChange={(event) => {
              const value = event.target.value;
              setReasonText(value);
              setQueue((current) => current.map((row) => ({ ...row, reasonText: value })));
            }}
          />
        </label>
      </div>
      <TableToolbar summary={`${queue.length}건`}>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
        <Button
          variant="primary"
          disabled={!canApply}
          loading={applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
        >
          적용
        </Button>
      </TableToolbar>
      <DataTable
        columns={columns}
        data={queue}
        pageSize={pageSize}
        emptyText="방을 검색해 학생을 추가해 주세요."
        caption="방 상벌점 부여 목록"
        getRowId={(resident) => String(resident.userId)}
      />
    </section>
  );
}
