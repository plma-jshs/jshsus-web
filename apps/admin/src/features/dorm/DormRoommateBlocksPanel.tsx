import { useMemo, useState } from 'react';
import type { DormRoommateBlock, DormStudentOption } from '@jshsus/types';
import { useMutation } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
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
  students: DormStudentOption[];
  blocks: DormRoommateBlock[];
  loading: boolean;
  refresh: () => Promise<unknown>;
};

function studentLabel(student: DormStudentOption) {
  return `${student.studentNo} ${student.name}`;
}

export function DormRoommateBlocksPanel({
  year,
  semester,
  students,
  blocks,
  loading,
  refresh,
}: Props) {
  const { showToast } = useToast();
  const [studentInput, setStudentInput] = useState('');
  const [blockedInput, setBlockedInput] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const selectedStudent = students.find((student) => studentLabel(student) === studentInput);
  const roommateOptions = selectedStudent
    ? students.filter(
        (student) =>
          student.userId !== selectedStudent.userId &&
          student.dormName === selectedStudent.dormName &&
          student.grade === selectedStudent.grade,
      )
    : students;

  const addMutation = useMutation({
    mutationFn: () => {
      const student = students.find((item) => studentLabel(item) === studentInput);
      const blocked = students.find((item) => studentLabel(item) === blockedInput);
      if (!student || !blocked) throw new Error('목록에서 두 학생을 선택해 주세요.');
      return api.createDormRoommateBlock({
        studentUserId: student.userId,
        blockedUserId: blocked.userId,
        year,
        semester,
      });
    },
    onSuccess: async () => {
      setBlockedInput('');
      showToast({ title: '함께 배정 금지 학생을 등록했습니다.', tone: 'success' });
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: '등록하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const deleteMutation = useMutation({
    mutationFn: api.deleteDormRoommateBlock,
    onSuccess: async () => {
      showToast({ title: '블랙리스트 항목을 삭제했습니다.', tone: 'success' });
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: '블랙리스트 항목을 삭제하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });

  const columns = useMemo<ColumnDef<DormRoommateBlock>[]>(
    () => [
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'studentName',
        header: '학생',
        enableSorting: false,
        meta: { width: 120, align: 'center' },
      },
      {
        accessorKey: 'blockedStudentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, align: 'center' },
      },
      {
        accessorKey: 'blockedStudentName',
        header: '함께 배정 금지 학생',
        enableSorting: false,
        meta: { width: 180, align: 'center' },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions>
            <RowActionButton
              icon={<Trash2 aria-hidden="true" />}
              label={`${row.original.studentName}·${row.original.blockedStudentName} 블랙리스트 삭제`}
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm('이 블랙리스트 항목을 삭제하시겠습니까?')) {
                  deleteMutation.mutate(row.original.id);
                }
              }}
            />
          </RowActions>
        ),
        enableSorting: false,
        meta: { width: 64, align: 'center' },
      },
    ],
    [deleteMutation],
  );

  return (
    <section className="admin-panel">
      <div className="panel-title">
        <h2>룸메이트 블랙리스트</h2>
      </div>
      <div className="dorm-block-form">
        <label>
          학생
          <input
            list="dorm-block-students"
            value={studentInput}
            onChange={(event) => {
              setStudentInput(event.target.value);
              setBlockedInput('');
            }}
            placeholder="학번 또는 이름 검색"
          />
        </label>
        <datalist id="dorm-block-students">
          {students.map((student) => (
            <option key={student.userId} value={studentLabel(student)} />
          ))}
        </datalist>
        <label>
          함께 배정 금지 학생
          <input
            list="dorm-blocked-students"
            value={blockedInput}
            onChange={(event) => setBlockedInput(event.target.value)}
            placeholder="학번 또는 이름 검색"
          />
        </label>
        <datalist id="dorm-blocked-students">
          {roommateOptions.map((student) => (
            <option key={student.userId} value={studentLabel(student)} />
          ))}
        </datalist>
        <Button
          variant="primary"
          loading={addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          추가
        </Button>
      </div>
      <TableToolbar summary={`총 ${blocks.length}건`}>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </TableToolbar>
      <DataTable
        columns={columns}
        data={blocks}
        loading={loading}
        pageSize={pageSize}
        sorting={sorting}
        onSortingChange={setSorting}
        alwaysShowPagination
        emptyText="등록된 블랙리스트가 없습니다."
        caption="룸메이트 블랙리스트"
        getRowId={(block) => String(block.id)}
      />
    </section>
  );
}
