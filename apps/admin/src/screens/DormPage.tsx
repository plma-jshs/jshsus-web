import type { FormEvent } from 'react';
import { useState } from 'react';
import type {
  DormAssignment,
  DormReport,
  DormReportStatus,
  DormRoom,
  DormStudentOption,
} from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/DataTable';
import { api } from '../lib/api';

const now = new Date();
const currentYear = now.getFullYear();
const currentSemester = now.getMonth() + 1 >= 8 ? 2 : 1;

const reportStatusLabels: Record<DormReportStatus, string> = {
  PENDING: '접수',
  PROCESSING: '처리중',
  COMPLETED: '완료',
};

const roomColumns: ColumnDef<DormRoom>[] = [
  { accessorKey: 'dormName', header: '생활관' },
  { accessorKey: 'name', header: '방' },
  { accessorKey: 'grade', header: '학년' },
  { accessorKey: 'capacity', header: '정원' },
  { accessorKey: 'assignedCount', header: '배정' },
];

const assignmentColumns: ColumnDef<DormAssignment>[] = [
  { accessorKey: 'roomName', header: '방' },
  { accessorKey: 'studentNo', header: '학번' },
  { accessorKey: 'studentName', header: '성명' },
  { accessorKey: 'year', header: '연도' },
  { accessorKey: 'semester', header: '학기' },
  { accessorKey: 'bedPosition', header: '침대' },
];

export function DormPage() {
  const queryClient = useQueryClient();
  const roomsQuery = useQuery({ queryKey: ['dorm-rooms'], queryFn: api.dormRooms });
  const studentsQuery = useQuery({ queryKey: ['dorm-students'], queryFn: api.dormStudents });
  const assignmentsQuery = useQuery({
    queryKey: ['dorm-assignments'],
    queryFn: api.dormAssignments,
  });
  const reportsQuery = useQuery({ queryKey: ['dorm-reports'], queryFn: api.dormReports });
  const [assignmentForm, setAssignmentForm] = useState({
    roomId: '',
    userId: '',
    year: String(currentYear),
    semester: String(currentSemester),
    bedPosition: '1',
  });

  const refreshDorm = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dorm-rooms'] }),
      queryClient.invalidateQueries({ queryKey: ['dorm-students'] }),
      queryClient.invalidateQueries({ queryKey: ['dorm-assignments'] }),
      queryClient.invalidateQueries({ queryKey: ['dorm-reports'] }),
    ]);
  };

  const createAssignmentMutation = useMutation({
    mutationFn: api.createDormAssignment,
    onSuccess: async () => {
      setAssignmentForm((form) => ({ ...form, userId: '', bedPosition: '1' }));
      await refreshDorm();
    },
  });
  const updateReportMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: DormReportStatus }) =>
      api.updateDormReportStatus(id, { status }),
    onSuccess: refreshDorm,
  });

  const reportColumns: ColumnDef<DormReport>[] = [
    { accessorKey: 'roomName', header: '방' },
    { accessorKey: 'studentNo', header: '학번' },
    { accessorKey: 'studentName', header: '성명' },
    { accessorKey: 'description', header: '내용' },
    {
      accessorKey: 'imageUrl',
      header: '첨부',
      cell: ({ row }) =>
        row.original.imageUrl ? (
          <a className="table-link" href={row.original.imageUrl} target="_blank" rel="noreferrer">
            보기
          </a>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ getValue }) => reportStatusLabels[getValue<DormReportStatus>()],
    },
    { accessorKey: 'comment', header: '메모' },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="table-action-row">
          <button
            className="table-action"
            type="button"
            onClick={() =>
              updateReportMutation.mutate({ id: row.original.id, status: 'PROCESSING' })
            }
            disabled={updateReportMutation.isPending || row.original.status === 'PROCESSING'}
          >
            처리중
          </button>
          <button
            className="table-action"
            type="button"
            onClick={() =>
              updateReportMutation.mutate({ id: row.original.id, status: 'COMPLETED' })
            }
            disabled={updateReportMutation.isPending || row.original.status === 'COMPLETED'}
          >
            완료
          </button>
        </div>
      ),
    },
  ];

  const handleCreateAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createAssignmentMutation.mutate({
      roomId: Number(assignmentForm.roomId),
      userId: Number(assignmentForm.userId),
      year: Number(assignmentForm.year),
      semester: Number(assignmentForm.semester),
      bedPosition: Number(assignmentForm.bedPosition),
    });
  };

  const rooms = roomsQuery.data ?? [];
  const students = studentsQuery.data ?? [];

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-title">
          <h2>기숙사 방 현황</h2>
        </div>
        <DataTable columns={roomColumns} data={roomsQuery.data ?? []} />
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <h2>배정 등록</h2>
        </div>
        <form className="admin-form-grid dorm-assignment-form" onSubmit={handleCreateAssignment}>
          <label>
            <span>방</span>
            <select
              value={assignmentForm.roomId}
              onChange={(event) =>
                setAssignmentForm((form) => ({ ...form, roomId: event.target.value }))
              }
              required
            >
              <option value="">선택</option>
              {rooms.map((room: DormRoom) => (
                <option key={room.id} value={room.id}>
                  {room.dormName} {room.name} ({room.assignedCount}/{room.capacity})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>학생</span>
            <select
              value={assignmentForm.userId}
              onChange={(event) =>
                setAssignmentForm((form) => ({ ...form, userId: event.target.value }))
              }
              required
            >
              <option value="">선택</option>
              {students.map((student: DormStudentOption) => (
                <option key={student.userId} value={student.userId}>
                  {student.studentNo} {student.name}
                  {student.currentRoom ? ` (${student.currentRoom} 배정됨)` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>연도</span>
            <input
              type="number"
              value={assignmentForm.year}
              onChange={(event) =>
                setAssignmentForm((form) => ({ ...form, year: event.target.value }))
              }
              min="2020"
              required
            />
          </label>
          <label>
            <span>학기</span>
            <select
              value={assignmentForm.semester}
              onChange={(event) =>
                setAssignmentForm((form) => ({ ...form, semester: event.target.value }))
              }
            >
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
          <label>
            <span>침대</span>
            <input
              type="number"
              value={assignmentForm.bedPosition}
              onChange={(event) =>
                setAssignmentForm((form) => ({ ...form, bedPosition: event.target.value }))
              }
              min="1"
              required
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={createAssignmentMutation.isPending}
          >
            등록
          </button>
        </form>
        {createAssignmentMutation.isError ? (
          <p className="form-error">배정 등록에 실패했습니다.</p>
        ) : null}
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <h2>배정 현황</h2>
        </div>
        <DataTable columns={assignmentColumns} data={assignmentsQuery.data ?? []} />
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <h2>기숙사 민원/보고</h2>
        </div>
        <DataTable columns={reportColumns} data={reportsQuery.data ?? []} />
      </section>
    </div>
  );
}
