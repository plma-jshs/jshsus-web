import { useMemo, useState } from 'react';
import type { DormRoommateBlock, DormStudentOption } from '@jshsus/types';
import { useMutation } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  Button,
  AdminSearchField,
  RowActionButton,
  RowActions,
  TableSummary,
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
    ? students.filter((student) => {
        const sameStudent = student.userId === selectedStudent.userId;
        const sameDorm = student.dormName === selectedStudent.dormName;
        const sameGrade = Number(student.grade) === Number(selectedStudent.grade);
        return !sameStudent && sameDorm && sameGrade;
      })
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
        meta: { width: 100, kind: 'studentNo' },
      },
      {
        accessorKey: 'studentName',
        header: '학생',
        enableSorting: false,
        meta: { width: 120, kind: 'person', mobileRole: 'title' },
      },
      {
        accessorKey: 'blockedStudentNo',
        header: '학번',
        enableSorting: true,
        meta: { width: 100, kind: 'studentNo' },
      },
      {
        accessorKey: 'blockedStudentName',
        header: '함께 배정 금지 학생',
        enableSorting: false,
        meta: { width: 180, kind: 'person', mobileRole: 'subtitle' },
      },
      {
        id: 'actions',
        header: '작업',
        cell: ({ row }) => (
          <RowActions
            mobileTitle={`${row.original.studentName}·${row.original.blockedStudentName}`}
          >
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
        meta: { width: 64, align: 'center', mobileRole: 'actions' },
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
          <AdminSearchField
            as="span"
            className="dorm-inline-search-field"
            iconSize={15}
            list="dorm-block-students"
            value={studentInput}
            onChange={(event) => {
              setStudentInput(event.target.value);
              setBlockedInput('');
            }}
            placeholder="학번 또는 이름 검색"
            onClear={() => setStudentInput('')}
          />
        </label>
        <datalist id="dorm-block-students">
          {students.map((student) => (
            <option key={student.userId} value={studentLabel(student)} />
          ))}
        </datalist>
        <label>
          함께 배정 금지 학생
          <AdminSearchField
            as="span"
            className="dorm-inline-search-field"
            iconSize={15}
            list="dorm-blocked-students"
            value={blockedInput}
            onChange={(event) => setBlockedInput(event.target.value)}
            placeholder="학번 또는 이름 검색"
            onClear={() => setBlockedInput('')}
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
      <TableToolbar
        summary={<TableSummary count={blocks.length} suffix="건" loading={loading} />}
      />
      <DataTable
        columns={columns}
        data={blocks}
        loading={loading}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        sorting={sorting}
        onSortingChange={setSorting}
        alwaysShowPagination
        emptyText="등록된 블랙리스트가 없습니다."
        caption="룸메이트 블랙리스트"
        getRowId={(block) => String(block.id)}
        renderMobileRow={(block) => (
          <article className="dorm-mobile-card">
            <header>
              <div>
                <strong>
                  {block.studentNo} {block.studentName}
                </strong>
                <span>
                  함께 배정 금지 · {block.blockedStudentNo} {block.blockedStudentName}
                </span>
              </div>
              <RowActions mobileTitle={`${block.studentName}·${block.blockedStudentName}`}>
                <RowActionButton
                  icon={<Trash2 aria-hidden="true" />}
                  label={`${block.studentName}·${block.blockedStudentName} 블랙리스트 삭제`}
                  variant="danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm('이 블랙리스트 항목을 삭제하시겠습니까?')) {
                      deleteMutation.mutate(block.id);
                    }
                  }}
                />
              </RowActions>
            </header>
          </article>
        )}
      />
    </section>
  );
}
