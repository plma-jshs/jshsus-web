import { useCallback, useMemo, useState } from 'react';
import type {
  DormAssignment,
  DormDrawBlockPair,
  DormDrawPlacement,
  DormDrawPreview,
  DormDrawViolation,
  DormRoom,
} from '@jshsus/types';
import { useMutation } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { MoveRight, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
  Dialog,
  PageSizeSelect,
  RowActionButton,
  RowActions,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';

type Props = {
  year: number;
  semester: number;
  rooms: DormRoom[];
  assignments: DormAssignment[];
  loading: boolean;
  refresh: () => Promise<unknown>;
};

function blockKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function canPlaceInRoom(
  placement: DormDrawPlacement,
  room: DormRoom,
  placements: DormDrawPlacement[],
  fixedPlacements: DormDrawPlacement[],
  blocks: DormDrawBlockPair[],
) {
  const occupants = [...fixedPlacements, ...placements].filter(
    (item) => item.userId !== placement.userId && item.roomId === room.id,
  );
  if (occupants.length >= room.capacity) return false;
  if (occupants.some((occupant) => occupant.classNo === placement.classNo)) return false;
  const blockedPairs = new Set(
    blocks.map((block) => blockKey(block.studentUserId, block.blockedUserId)),
  );
  return occupants.every(
    (occupant) => !blockedPairs.has(blockKey(occupant.userId, placement.userId)),
  );
}

function validateDraftPlacements(
  rooms: DormRoom[],
  placements: DormDrawPlacement[],
  fixedPlacements: DormDrawPlacement[],
  blocks: DormDrawBlockPair[],
): DormDrawViolation[] {
  const violations: DormDrawViolation[] = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const blockedPairs = new Set(
    blocks.map((block) => blockKey(block.studentUserId, block.blockedUserId)),
  );
  const occupantsByRoom = new Map<number, DormDrawPlacement[]>();
  const seenUsers = new Set<number>();
  const seenBeds = new Set<string>();

  for (const placement of [...fixedPlacements, ...placements]) {
    const room = roomById.get(placement.roomId);
    if (!room) {
      violations.push({
        code: 'ROOM_NOT_FOUND',
        message: '존재하지 않는 방이 미리보기에 포함되어 있습니다.',
        roomId: placement.roomId,
        userId: placement.userId,
      });
      continue;
    }
    if (seenUsers.has(placement.userId)) {
      violations.push({
        code: 'DUPLICATE_STUDENT',
        message: `${placement.studentNo} ${placement.studentName} 학생이 중복 배정되었습니다.`,
        roomId: room.id,
        userId: placement.userId,
      });
    }
    seenUsers.add(placement.userId);
    const bedKey = `${room.id}:${placement.bedPosition}`;
    if (seenBeds.has(bedKey)) {
      violations.push({
        code: 'DUPLICATE_BED',
        message: `${room.dormName} ${room.name} ${placement.bedPosition}번 침대가 중복되었습니다.`,
        roomId: room.id,
        userId: placement.userId,
      });
    }
    seenBeds.add(bedKey);
    if (placement.bedPosition < 1 || placement.bedPosition > room.capacity) {
      violations.push({
        code: 'CAPACITY_EXCEEDED',
        message: `${room.dormName} ${room.name}의 침대 위치가 정원을 벗어났습니다.`,
        roomId: room.id,
        userId: placement.userId,
      });
    }
    if (placement.grade !== room.grade) {
      violations.push({
        code: 'GRADE_MISMATCH',
        message: `${placement.studentNo} ${placement.studentName} 학생과 방의 학년이 다릅니다.`,
        roomId: room.id,
        userId: placement.userId,
      });
    }
    const occupants = occupantsByRoom.get(room.id) ?? [];
    occupants.push(placement);
    occupantsByRoom.set(room.id, occupants);
  }

  for (const [roomId, occupants] of occupantsByRoom) {
    const room = roomById.get(roomId)!;
    if (occupants.length > room.capacity) {
      violations.push({
        code: 'CAPACITY_EXCEEDED',
        message: `${room.dormName} ${room.name}의 배정 인원이 정원을 초과했습니다.`,
        roomId,
      });
    }
    for (let leftIndex = 0; leftIndex < occupants.length; leftIndex += 1) {
      const left = occupants[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < occupants.length; rightIndex += 1) {
        const right = occupants[rightIndex]!;
        if (left.classNo > 0 && left.classNo === right.classNo) {
          violations.push({
            code: 'SAME_CLASS',
            message: `${room.dormName} ${room.name}에 같은 반 학생이 함께 배정되었습니다.`,
            roomId,
            userId: right.userId,
          });
        }
        if (blockedPairs.has(blockKey(left.userId, right.userId))) {
          violations.push({
            code: 'ROOMMATE_BLOCK',
            message: `${room.dormName} ${room.name}에 함께 배정 금지 학생이 포함되어 있습니다.`,
            roomId,
            userId: right.userId,
          });
        }
      }
    }
  }

  return violations;
}

function uniqueViolations(violations: DormDrawViolation[]) {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.code}:${violation.roomId ?? ''}:${violation.userId ?? ''}:${violation.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function DormAssignmentPanel({
  year,
  semester,
  rooms,
  assignments,
  loading,
  refresh,
}: Props) {
  const { showToast } = useToast();
  const [drawDorm, setDrawDorm] = useState<DormRoom['dormName']>('송죽관');
  const [drawGrade, setDrawGrade] = useState(1);
  const [preview, setPreview] = useState<DormDrawPreview | null>(null);
  const [placements, setPlacements] = useState<DormDrawPlacement[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [previewPageSize, setPreviewPageSize] = useState(20);
  const [pageSize, setPageSize] = useState(20);
  const [assignmentSorting, setAssignmentSorting] = useState<SortingState>([]);
  const [movingAssignment, setMovingAssignment] = useState<DormAssignment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DormAssignment | null>(null);
  const [moveRoomId, setMoveRoomId] = useState('');
  const [moveBed, setMoveBed] = useState('1');

  const previewMutation = useMutation({
    mutationFn: () => api.previewDormDraw({ year, semester, dormName: drawDorm, grade: drawGrade }),
    onSuccess: (result) => {
      setPreview(result);
      setPlacements(result.placements);
    },
    onError: () => showToast({ title: '추첨 미리보기를 만들지 못했습니다.', tone: 'danger' }),
  });
  const applyMutation = useMutation({
    mutationFn: () =>
      api.applyDormDraw({
        year,
        semester,
        targetUserIds: preview?.targetUserIds ?? [],
        placements: placements.map(({ userId, roomId, bedPosition }) => ({
          userId,
          roomId,
          bedPosition,
        })),
      }),
    onSuccess: async (result) => {
      showToast({
        title: `${result.assignmentCount}명 배정 · ${result.unassignedCount}명 미배정으로 적용했습니다.`,
        tone: 'success',
      });
      setPreview(null);
      setPlacements([]);
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: '배정을 적용하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const moveMutation = useMutation({
    mutationFn: () =>
      api.moveDormAssignment(movingAssignment!.id, {
        roomId: Number(moveRoomId),
        bedPosition: Number(moveBed),
      }),
    onSuccess: async () => {
      showToast({ title: '배정을 이동했습니다.', tone: 'success' });
      setMovingAssignment(null);
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: '배정을 이동하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const swapMutation = useMutation({
    mutationFn: () =>
      api.swapDormAssignments({
        leftAssignmentId: selectedAssignments[0]!,
        rightAssignmentId: selectedAssignments[1]!,
      }),
    onSuccess: async () => {
      showToast({ title: '두 학생의 방을 교환했습니다.', tone: 'success' });
      setSelectedAssignments([]);
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: '방을 교환하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.cancelDormAssignment(id),
    onSuccess: async () => {
      showToast({ title: '배정을 취소했습니다.', tone: 'success' });
      setCancelTarget(null);
      await refresh();
    },
    onError: () => showToast({ title: '배정을 취소하지 못했습니다.', tone: 'danger' }),
  });

  const drawRooms = rooms.filter((room) => room.dormName === drawDorm && room.grade === drawGrade);
  const draftViolations = preview
    ? uniqueViolations([
        ...preview.violations,
        ...validateDraftPlacements(
          rooms,
          placements,
          preview.fixedPlacements,
          preview.roommateBlocks,
        ),
      ])
    : [];

  const updatePlacementRoom = useCallback(
    (userId: number, roomId: number) => {
      const room = rooms.find((item) => item.id === roomId);
      const placement = placements.find((item) => item.userId === userId);
      if (
        !room ||
        !placement ||
        !preview ||
        !canPlaceInRoom(
          placement,
          room,
          placements,
          preview.fixedPlacements,
          preview.roommateBlocks,
        )
      ) {
        showToast({ title: '해당 방은 현재 제약 조건을 만족하지 않습니다.', tone: 'warning' });
        return;
      }
      const usedBeds = new Set(
        [...preview.fixedPlacements, ...placements]
          .filter((item) => item.userId !== userId && item.roomId === roomId)
          .map((item) => item.bedPosition),
      );
      let bedPosition = 1;
      while (usedBeds.has(bedPosition) && bedPosition <= room.capacity) bedPosition += 1;
      setPlacements((current) =>
        current.map((currentPlacement) =>
          currentPlacement.userId === userId
            ? {
                ...currentPlacement,
                roomId,
                roomName: room.name,
                dormName: room.dormName,
                bedPosition,
              }
            : currentPlacement,
        ),
      );
    },
    [placements, preview, rooms, showToast],
  );

  const previewColumns = useMemo<ColumnDef<DormDrawPlacement>[]>(
    () => [
      {
        accessorKey: 'studentNo',
        header: '학생',
        cell: ({ row }) => (
          <strong>
            {row.original.studentNo} {row.original.studentName}
          </strong>
        ),
        enableSorting: true,
        meta: { width: 170, align: 'center' },
      },
      {
        accessorKey: 'classNo',
        header: '반',
        cell: ({ getValue }) => `${getValue<number>()}반`,
        enableSorting: false,
        meta: { width: 70, align: 'center' },
      },
      {
        id: 'room',
        header: '방',
        cell: ({ row }) => (
          <select
            aria-label={`${row.original.studentName} 방`}
            value={row.original.roomId}
            onChange={(event) =>
              updatePlacementRoom(row.original.userId, Number(event.target.value))
            }
          >
            {drawRooms.map((room) => (
              <option
                key={room.id}
                value={room.id}
                disabled={
                  !preview ||
                  !canPlaceInRoom(
                    row.original,
                    room,
                    placements,
                    preview.fixedPlacements,
                    preview.roommateBlocks,
                  )
                }
              >
                {room.name}
              </option>
            ))}
          </select>
        ),
        enableSorting: false,
        meta: { width: 150, align: 'center' },
      },
      {
        id: 'bed',
        header: '침대',
        cell: ({ row }) => {
          const room = rooms.find((item) => item.id === row.original.roomId);
          const usedBeds = new Set(
            [...(preview?.fixedPlacements ?? []), ...placements]
              .filter(
                (item) =>
                  item.userId !== row.original.userId && item.roomId === row.original.roomId,
              )
              .map((item) => item.bedPosition),
          );
          return (
            <select
              aria-label={`${row.original.studentName} 침대`}
              value={row.original.bedPosition}
              onChange={(event) =>
                setPlacements((current) =>
                  current.map((placement) =>
                    placement.userId === row.original.userId
                      ? { ...placement, bedPosition: Number(event.target.value) }
                      : placement,
                  ),
                )
              }
            >
              {Array.from({ length: room?.capacity ?? 0 }, (_, index) => index + 1).map((bed) => (
                <option key={bed} value={bed} disabled={usedBeds.has(bed)}>
                  {bed}번
                </option>
              ))}
            </select>
          );
        },
        enableSorting: false,
        meta: { width: 120, align: 'center' },
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
                setPlacements((current) =>
                  current.filter((placement) => placement.userId !== row.original.userId),
                )
              }
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { width: 64, align: 'center' },
      },
    ],
    [drawRooms, placements, preview, rooms, updatePlacementRoom],
  );

  const fixedPlacementColumns = useMemo<ColumnDef<DormDrawPlacement>[]>(
    () => [
      {
        accessorKey: 'dormName',
        header: '생활관',
        enableSorting: false,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'roomName',
        header: '호실',
        enableSorting: true,
        meta: { width: 90, align: 'center' },
      },
      {
        accessorKey: 'bedPosition',
        header: '침대',
        cell: ({ getValue }) => `${getValue<number>()}번`,
        enableSorting: true,
        meta: { width: 80, align: 'center' },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'studentName',
        header: '이름',
        enableSorting: false,
        meta: { width: 110, align: 'center' },
      },
      {
        accessorKey: 'classNo',
        header: '반',
        cell: ({ getValue }) => (getValue<number>() > 0 ? `${getValue<number>()}반` : '-'),
        enableSorting: false,
        meta: { width: 70, align: 'center' },
      },
    ],
    [],
  );

  const assignmentColumns = useMemo<ColumnDef<DormAssignment>[]>(
    () => [
      {
        id: 'select',
        header: '선택',
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`${row.original.studentName} 교환 선택`}
            checked={selectedAssignments.includes(row.original.id)}
            onChange={(event) =>
              setSelectedAssignments((current) =>
                event.target.checked
                  ? [...current, row.original.id].slice(-2)
                  : current.filter((id) => id !== row.original.id),
              )
            }
          />
        ),
        enableSorting: false,
        meta: { width: 62, align: 'center' },
      },
      {
        accessorKey: 'dormName',
        header: '생활관',
        enableSorting: false,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'roomName',
        header: '호실',
        enableSorting: true,
        meta: { width: 90, align: 'center' },
      },
      {
        accessorKey: 'bedPosition',
        header: '침대',
        cell: ({ getValue }) => `${getValue<number>()}번`,
        enableSorting: true,
        meta: { width: 80, align: 'center' },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'studentName',
        header: '이름',
        enableSorting: false,
        meta: { width: 110, align: 'center' },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions className="dorm-row-actions">
            <RowActionButton
              icon={<MoveRight aria-hidden="true" />}
              label={`${row.original.studentName} 이동`}
              variant="primary"
              onClick={() => {
                setMovingAssignment(row.original);
                setMoveRoomId(String(row.original.roomId));
                setMoveBed(String(row.original.bedPosition));
              }}
            />
            <RowActionButton
              icon={<X aria-hidden="true" />}
              label={`${row.original.studentName} 배정 취소`}
              variant="danger"
              onClick={() => setCancelTarget(row.original)}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { width: 92, align: 'center' },
      },
    ],
    [selectedAssignments],
  );

  const moveRooms = movingAssignment
    ? rooms.filter(
        (room) =>
          room.grade === movingAssignment.grade && room.dormName === movingAssignment.dormName,
      )
    : [];
  const selectedMoveRoom = moveRooms.find((room) => room.id === Number(moveRoomId));
  const showDrawPanel = !loading && assignments.length === 0;

  return (
    <div className="admin-stack dorm-management-stack">
      {showDrawPanel ? (
        <section className="admin-panel">
          <div className="panel-title">
            <h2>방 추첨</h2>
          </div>
          <div className="dorm-draw-controls">
            <select
              value={drawDorm}
              onChange={(event) => {
                setDrawDorm(event.target.value as DormRoom['dormName']);
                setPreview(null);
              }}
              aria-label="추첨 생활관"
            >
              <option value="송죽관">송죽관</option>
              <option value="동백관">동백관</option>
            </select>
            <select
              value={drawGrade}
              onChange={(event) => {
                setDrawGrade(Number(event.target.value));
                setPreview(null);
              }}
              aria-label="추첨 학년"
            >
              {[1, 2, 3].map((grade) => (
                <option key={grade} value={grade}>
                  {grade}학년
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              추첨 미리보기
            </Button>
          </div>
          {preview ? (
            <div className="dorm-preview-block">
              <TableToolbar
                summary={`대상 ${preview.targetUserIds.length}명 · 배정 ${placements.length}명 · 미배정 ${preview.targetUserIds.length - placements.length}명`}
              >
                <PageSizeSelect value={previewPageSize} onChange={setPreviewPageSize} />
                <Button
                  variant="primary"
                  loading={applyMutation.isPending}
                  disabled={preview.targetUserIds.length === 0 || draftViolations.length > 0}
                  onClick={() => applyMutation.mutate()}
                >
                  적용
                </Button>
              </TableToolbar>
              {draftViolations.length ? (
                <div className="dorm-draw-violations" role="alert">
                  <strong>배정 위반 {draftViolations.length}건</strong>
                  <ul>
                    {draftViolations.map((violation, index) => (
                      <li
                        key={`${violation.code}-${violation.roomId ?? 'room'}-${violation.userId ?? 'user'}-${index}`}
                      >
                        {violation.message}
                      </li>
                    ))}
                  </ul>
                  <p>위반 항목을 해소한 뒤 적용할 수 있습니다.</p>
                </div>
              ) : null}
              {preview.fixedPlacements.length ? (
                <div className="dorm-fixed-placements">
                  <div className="dorm-preview-heading">
                    <strong>고정 거주자 {preview.fixedPlacements.length}명</strong>
                    <span>아래 학생과 사용 중인 침대는 이번 추첨에서 변경하지 않습니다.</span>
                  </div>
                  <DataTable
                    columns={fixedPlacementColumns}
                    data={preview.fixedPlacements}
                    pageSize={previewPageSize}
                    emptyText="고정 거주자가 없습니다."
                    caption="방 추첨 고정 거주자"
                    getRowId={(placement) => String(placement.userId)}
                  />
                </div>
              ) : null}
              <div className="dorm-preview-heading">
                <strong>신규 배정</strong>
                <span>제외하거나 미배정된 대상 학생은 적용 시 기존 배정도 해제됩니다.</span>
              </div>
              <DataTable
                columns={previewColumns}
                data={placements}
                pageSize={previewPageSize}
                emptyText="배정 가능한 학생이 없습니다."
                caption="방 추첨 미리보기"
                getRowId={(placement) => String(placement.userId)}
              />
              {preview.unassigned.length ? (
                <div className="dorm-draw-warning">
                  <strong>추첨 대상 중 미배정 {preview.unassigned.length}명</strong>
                  <ul>
                    {preview.unassigned.map((student) => (
                      <li key={student.userId}>
                        {student.studentNo} {student.name} · {student.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.ineligible.length ? (
                <div className="dorm-draw-notice">
                  <strong>확인 필요 {preview.ineligible.length}명 · 추첨 대상 아님</strong>
                  <ul>
                    {preview.ineligible.map((student) => (
                      <li key={student.userId}>
                        {student.studentNo} {student.name} · {student.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-panel">
        <TableToolbar summary={`총 ${assignments.length}명`}>
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
          <Button
            disabled={selectedAssignments.length !== 2}
            loading={swapMutation.isPending}
            onClick={() => swapMutation.mutate()}
          >
            선택한 2명 교환
          </Button>
        </TableToolbar>
        <DataTable
          columns={assignmentColumns}
          data={assignments}
          loading={loading}
          pageSize={pageSize}
          sorting={assignmentSorting}
          onSortingChange={setAssignmentSorting}
          alwaysShowPagination
          emptyText="배정된 학생이 없습니다."
          caption="기숙사 배정 목록"
          getRowId={(assignment) => String(assignment.id)}
        />
      </section>

      <Dialog
        open={Boolean(movingAssignment)}
        onClose={() => setMovingAssignment(null)}
        title="배정 이동"
        description={
          movingAssignment
            ? `${movingAssignment.studentNo} ${movingAssignment.studentName}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setMovingAssignment(null)}>취소</Button>
            <Button
              variant="primary"
              loading={moveMutation.isPending}
              disabled={!moveRoomId}
              onClick={() => moveMutation.mutate()}
            >
              이동
            </Button>
          </>
        }
      >
        <div className="dorm-dialog-form">
          <label>
            방
            <select
              value={moveRoomId}
              onChange={(event) => {
                setMoveRoomId(event.target.value);
                setMoveBed('1');
              }}
            >
              {moveRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.dormName} {room.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            침대
            <select value={moveBed} onChange={(event) => setMoveBed(event.target.value)}>
              {Array.from({ length: selectedMoveRoom?.capacity ?? 0 }, (_, index) => index + 1).map(
                (bed) => (
                  <option key={bed} value={bed}>
                    {bed}번
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="배정 취소"
        description={
          cancelTarget
            ? `${cancelTarget.studentNo} ${cancelTarget.studentName} 학생의 현재 학기 배정을 취소합니다.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setCancelTarget(null)}>닫기</Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
            >
              배정 취소
            </Button>
          </>
        }
      >
        <p>취소 후에는 배정 목록에서 제거되며, 필요하면 다시 배정할 수 있습니다.</p>
      </Dialog>
    </div>
  );
}
