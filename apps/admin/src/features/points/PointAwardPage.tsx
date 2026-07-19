import type { PointReason } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { Button, FormField, TableToolbar, useToast } from '../../components/ui';
import { pointsApi, type PointStudentRow } from './pointsApi';
import './points.css';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

type QueuedRecord = {
  key: string;
  studentId: number;
  studentNo: number;
  studentName: string;
  reasonId: number;
  point: number;
  reasonText: string;
  baseDate: string;
};

type DirectStudentSelection = {
  grade: string;
  classNo: string;
  number: string;
};

const emptyDirectStudentSelection: DirectStudentSelection = {
  grade: '',
  classNo: '',
  number: '',
};

function validateDirectStudentSelection(value: DirectStudentSelection) {
  const fields = [value.grade, value.classNo, value.number];
  if (fields.every((field) => field === '')) return null;
  if (fields.some((field) => field === '')) return '학년, 반, 번호를 모두 입력해 주세요.';

  const grade = Number(value.grade);
  const classNo = Number(value.classNo);
  const number = Number(value.number);
  if (!Number.isInteger(grade) || grade < 1 || grade > 3) return '학년은 1~3만 입력할 수 있습니다.';
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 4)
    return '반은 1~4만 입력할 수 있습니다.';
  if (!Number.isInteger(number) || number < 1 || number > 20)
    return '번호는 1~20만 입력할 수 있습니다.';
  return null;
}

function directSelectionFromStudent(student: PointStudentRow): DirectStudentSelection {
  const selection = {
    grade: String(student.grade),
    classNo: String(student.classNo),
    number: String(student.number),
  };
  return validateDirectStudentSelection(selection) ? emptyDirectStudentSelection : selection;
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      className="point-row-checkbox"
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

const reasonTypeLabel: Record<PointReason['type'], string> = {
  PLUS: '상점',
  MINUS: '벌점',
  ETC: '기타',
};

async function downloadImportTemplate(reasons: PointReason[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('상벌점');
  worksheet.columns = [
    { header: '학번', key: 'studentNo', width: 12 },
    { header: '기준일', key: 'baseDate', width: 14 },
    { header: '사유코드', key: 'reasonId', width: 12 },
    { header: '점수', key: 'point', width: 10 },
    { header: '사유', key: 'reasonText', width: 40 },
  ];
  worksheet.getColumn('baseDate').numFmt = 'yyyy-mm-dd';
  const reference = workbook.addWorksheet('사유코드');
  reference.columns = [
    { header: '사유코드', key: 'id', width: 12 },
    { header: '종류', key: 'type', width: 10 },
    { header: '기본 점수', key: 'point', width: 12 },
    { header: '사유', key: 'comment', width: 40 },
  ];
  for (const reason of reasons) {
    reference.addRow({
      id: reason.id,
      type: reasonTypeLabel[reason.type],
      point: reason.point,
      comment: reason.comment,
    });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `상벌점_일괄등록_양식_${today}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function workbookDate(value: unknown, fallback: string) {
  if (!(value instanceof Date)) return fallback.trim();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function PointAwardPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reasonsQuery = useQuery({ queryKey: ['point-reasons'], queryFn: pointsApi.reasons });
  const [selectedStudents, setSelectedStudents] = useState<PointStudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [direct, setDirect] = useState<DirectStudentSelection>(emptyDirectStudentSelection);
  const [form, setForm] = useState({
    reasonId: '',
    point: '',
    reasonText: '',
    baseDate: today,
  });
  const [queue, setQueue] = useState<QueuedRecord[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [editKey, setEditKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const activeReasons = useMemo(
    () =>
      [...(reasonsQuery.data?.filter((reason) => reason.isActive) ?? [])].sort(
        (left, right) => left.id - right.id,
      ),
    [reasonsQuery.data],
  );
  const selectedReason = activeReasons.find((reason) => reason.id === Number(form.reasonId));
  const selectedStudentIds = useMemo(
    () => new Set(selectedStudents.map((student) => student.id)),
    [selectedStudents],
  );
  const searchQuery = useQuery({
    queryKey: ['point-student-inline-picker', search],
    queryFn: () =>
      pointsApi.students({
        page: 1,
        pageSize: 20,
        search: search || undefined,
        sortBy: 'studentNo',
        sortOrder: 'asc',
      }),
    enabled: searchOpen,
  });
  const directMutation = useMutation({
    mutationFn: () =>
      pointsApi.students({
        page: 1,
        pageSize: 10,
        grade: Number(direct.grade),
        classNo: Number(direct.classNo),
        number: Number(direct.number),
      }),
    onSuccess: (result) => {
      const student = result.items.length === 1 ? result.items[0] : null;
      if (!student) return;
      addStudentSelection(student);
    },
    onError: (error) => {
      showToast({
        title: '학생을 선택하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      pointsApi.createRecordBatch({
        idempotencyKey: crypto.randomUUID(),
        records: queue.map(({ studentId, reasonId, point, reasonText, baseDate }) => ({
          studentId,
          reasonId,
          point,
          reasonText,
          baseDate,
        })),
      }),
    onSuccess: async (result) => {
      showToast({
        title: '상벌점 적용 완료',
        description: `${result.recordIds.length}건을 적용했습니다.`,
        tone: 'success',
      });
      setFeedback('');
      setQueue([]);
      setSelectedKeys(new Set());
      setEditKey(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-student-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-record-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-departure-candidates'] }),
      ]);
    },
    onError: (error) => {
      showToast({
        title: '상벌점을 적용하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });
  const importMutation = useMutation({
    mutationFn: pointsApi.previewRecordImport,
    onSuccess: (result) => {
      const validRows = result.rows.filter(
        (row): row is typeof row & { studentId: number; studentName: string } =>
          row.errors.length === 0 && Boolean(row.studentId && row.studentName),
      );
      setQueue((items) => [
        ...items,
        ...validRows.map((row) => ({
          key: crypto.randomUUID(),
          studentId: row.studentId,
          studentNo: row.studentNo,
          studentName: row.studentName,
          reasonId: row.reasonId,
          point: row.point,
          reasonText: row.reason,
          baseDate: row.baseDate,
        })),
      ]);
      setImportErrors((current) => [
        ...current,
        ...result.rows
          .filter((row) => row.errors.length > 0)
          .map((row) => `${row.rowNumber}행: ${row.errors.join(', ')}`),
      ]);
      if (validRows.length > 0) {
        showToast({
          title: '엑셀 검토 완료',
          description: `${validRows.length}건을 목록에 추가했습니다.`,
          tone: 'success',
        });
      }
      setFeedback('');
    },
    onError: (error) => {
      showToast({
        title: '엑셀 내용을 검토하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });
  function addStudentSelection(student: PointStudentRow) {
    setSelectedStudents((current) => {
      if (editKey) return [student];
      if (current.some((item) => item.id === student.id)) return current;
      return [...current, student].sort((left, right) => left.studentNo - right.studentNo);
    });
    setSearch('');
    setDirect(emptyDirectStudentSelection);
    directMutation.reset();
    setSearchOpen(false);
  }

  const selectStudent = (student: PointStudentRow) => {
    addStudentSelection(student);
  };

  const clearStudentSelection = () => {
    setSelectedStudents([]);
    setSearch('');
    setSearchOpen(false);
    setDirect(emptyDirectStudentSelection);
    directMutation.reset();
    setEditKey(null);
  };

  const removeStudentSelection = (studentId: number) => {
    setSelectedStudents((current) => current.filter((student) => student.id !== studentId));
    if (editKey) setEditKey(null);
  };

  const addToQueue = (event: FormEvent) => {
    event.preventDefault();
    const point = Number(form.point);
    if (
      !selectedStudents.length ||
      !selectedReason ||
      !form.reasonText.trim() ||
      Number.isNaN(point)
    )
      return;
    if (selectedReason.type === 'PLUS' && point <= 0) {
      setFeedback('상점은 1점 이상이어야 합니다.');
      return;
    }
    if (selectedReason.type === 'MINUS' && point >= 0) {
      setFeedback('벌점은 -1점 이하여야 합니다.');
      return;
    }
    const nextRecords = selectedStudents.map((student) => ({
      key: editKey && selectedStudents.length === 1 ? editKey : crypto.randomUUID(),
      studentId: student.id,
      studentNo: student.studentNo,
      studentName: student.name,
      reasonId: selectedReason.id,
      point,
      reasonText: form.reasonText.trim(),
      baseDate: form.baseDate,
    }));
    setQueue((items) =>
      editKey && nextRecords.length === 1
        ? items.map((item) => (item.key === editKey ? nextRecords[0] : item))
        : [...items, ...nextRecords],
    );
    clearStudentSelection();
    setFeedback('');
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportErrors([]);
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const bytes = (await file.arrayBuffer()) as Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(bytes);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        setImportErrors(['첫 번째 시트를 찾지 못했습니다.']);
        return;
      }
      const header = Array.from({ length: 5 }, (_, index) =>
        worksheet
          .getRow(1)
          .getCell(index + 1)
          .text.trim(),
      );
      if (header.join(',') !== '학번,기준일,사유코드,점수,사유') {
        setImportErrors(['엑셀 양식의 열 이름을 확인해 주세요.']);
        return;
      }
      const localErrors: string[] = [];
      const payload: Array<{
        rowNumber: number;
        studentNo: number;
        baseDate: string;
        reasonId: number;
        point: number;
        reasonText: string;
      }> = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const studentNo = Number(row.getCell(1).text.trim());
        const baseDate = workbookDate(row.getCell(2).value, row.getCell(2).text);
        const reasonId = Number(row.getCell(3).text.trim());
        const point = Number(row.getCell(4).text.trim());
        const reasonText = row.getCell(5).text.trim();
        const errors: string[] = [];
        if (!Number.isInteger(studentNo) || studentNo <= 0) errors.push('학번');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) errors.push('기준일');
        if (!Number.isInteger(reasonId) || reasonId <= 0) errors.push('사유코드');
        if (!Number.isInteger(point) || point < -100 || point > 100) errors.push('점수');
        if (!reasonText || reasonText.length > 255) errors.push('사유');
        if (errors.length > 0) {
          localErrors.push(`${rowNumber}행: ${errors.join(', ')} 값을 확인해 주세요.`);
          return;
        }
        payload.push({ rowNumber, studentNo, baseDate, reasonId, point, reasonText });
      });
      if (payload.length === 0) {
        setImportErrors(localErrors.length > 0 ? localErrors : ['입력된 행이 없습니다.']);
        return;
      }
      setImportErrors(localErrors);
      importMutation.mutate({ rows: payload });
    } catch {
      setImportErrors(['파일을 읽지 못했습니다. XLSX 형식인지 확인해 주세요.']);
    }
  };

  const queueColumns = useMemo<ColumnDef<QueuedRecord>[]>(
    () => [
      {
        id: 'selection',
        header: () => (
          <SelectionCheckbox
            checked={queue.length > 0 && selectedKeys.size === queue.length}
            indeterminate={selectedKeys.size > 0 && selectedKeys.size < queue.length}
            label="전체 선택"
            onChange={(checked) =>
              setSelectedKeys(checked ? new Set(queue.map((item) => item.key)) : new Set())
            }
          />
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <SelectionCheckbox
            checked={selectedKeys.has(row.original.key)}
            label={`${row.original.studentNo} ${row.original.studentName} 선택`}
            onChange={(checked) =>
              setSelectedKeys((current) => {
                const next = new Set(current);
                if (checked) next.add(row.original.key);
                else next.delete(row.original.key);
                return next;
              })
            }
          />
        ),
        meta: { align: 'center', width: 58 },
      },
      {
        id: 'rowNumber',
        header: '번호',
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { align: 'center', width: 72 },
      },
      {
        accessorKey: 'studentNo',
        header: '학번',
        enableSorting: false,
        meta: { align: 'center', width: 100 },
      },
      {
        accessorKey: 'studentName',
        header: '성명',
        enableSorting: false,
        meta: { align: 'center', width: 110 },
      },
      {
        accessorKey: 'point',
        header: '점수',
        enableSorting: false,
        cell: ({ row }) => `${row.original.point > 0 ? '+' : ''}${row.original.point}`,
        meta: { align: 'center', width: 80 },
      },
      {
        accessorKey: 'baseDate',
        header: '기준일',
        enableSorting: false,
        meta: { align: 'center', width: 120 },
      },
      {
        accessorKey: 'reasonText',
        header: '사유',
        enableSorting: false,
        meta: { minWidth: 240 },
      },
      {
        id: 'actions',
        header: '작업',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="point-table-actions">
            <Button
              className="point-action point-action--edit"
              size="sm"
              variant="ghost"
              aria-label={`${row.original.studentNo} ${row.original.studentName} 수정`}
              onClick={() => {
                const item = row.original;
                const student = {
                  id: item.studentId,
                  studentNo: item.studentNo,
                  name: item.studentName,
                  grade: Math.floor(item.studentNo / 1000),
                  classNo: Math.floor((item.studentNo % 1000) / 100),
                  number: item.studentNo % 100,
                  currentPoint: 0,
                  meritPoint: 0,
                  penaltyPoint: 0,
                  isDepartureCandidate: false,
                  riskStatus: 'normal',
                } satisfies PointStudentRow;
                setSelectedStudents([student]);
                setSearch(`${item.studentNo} ${item.studentName}`);
                setDirect(directSelectionFromStudent(student));
                setSearchOpen(false);
                setForm({
                  reasonId: String(item.reasonId),
                  point: String(item.point),
                  reasonText: item.reasonText,
                  baseDate: item.baseDate,
                });
                setEditKey(item.key);
              }}
            >
              <Pencil size={15} aria-hidden="true" />
              수정
            </Button>
          </div>
        ),
        meta: { align: 'center', width: 96 },
      },
    ],
    [queue, selectedKeys],
  );

  const deleteSelectedRows = () => {
    const deletedCount = selectedKeys.size;
    if (deletedCount === 0) return;
    setQueue((items) => items.filter((item) => !selectedKeys.has(item.key)));
    if (editKey && selectedKeys.has(editKey)) clearStudentSelection();
    setSelectedKeys(new Set());
    showToast({
      title: '선택 항목 삭제',
      description: `${deletedCount}건을 적용 목록에서 삭제했습니다.`,
      tone: 'success',
    });
  };

  const directValidation = validateDirectStudentSelection(direct);
  const directReady = Boolean(direct.grade && direct.classNo && direct.number && !directValidation);
  const directNotFound = directMutation.isSuccess && directMutation.data?.items.length !== 1;

  return (
    <div className="admin-stack point-award-page">
      <section className="admin-panel point-panel point-award-form">
        <div className="point-section-heading">
          <h2>상벌점 부여</h2>
        </div>
        <form className="point-award-combined" onSubmit={addToQueue}>
          <div className="point-student-picker-section">
            <FormField label="학생 검색" className="point-student-search">
              <div className="point-search-combobox">
                <input
                  value={search}
                  placeholder="학번 또는 이름"
                  autoComplete="off"
                  onFocus={(event) => {
                    setSearchOpen(true);
                    if (search) event.currentTarget.select();
                  }}
                  onBlur={() => setSearchOpen(false)}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setDirect(emptyDirectStudentSelection);
                    directMutation.reset();
                    setSearchOpen(true);
                  }}
                />
                {searchOpen ? (
                  <div className="point-search-results" role="listbox" aria-label="학생 검색 결과">
                    {searchQuery.isLoading ? <p>불러오는 중입니다.</p> : null}
                    {searchQuery.data?.items.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        role="option"
                        disabled={selectedStudentIds.has(student.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectStudent(student)}
                      >
                        <span>
                          <strong>{student.studentNo}</strong> {student.name}
                        </span>
                        <span>{selectedStudentIds.has(student.id) ? '추가됨' : '추가'}</span>
                      </button>
                    ))}
                    {!searchQuery.isLoading && searchQuery.data?.items.length === 0 ? (
                      <p>검색 결과가 없습니다.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </FormField>
            <div className="point-direct-picker">
              <FormField label="학년">
                <input
                  type="number"
                  min={1}
                  max={3}
                  step={1}
                  value={direct.grade}
                  onChange={(event) => {
                    setDirect((current) => ({ ...current, grade: event.target.value }));
                    setSearch('');
                    setSearchOpen(false);
                    directMutation.reset();
                  }}
                />
              </FormField>
              <FormField label="반">
                <input
                  type="number"
                  min={1}
                  max={4}
                  step={1}
                  value={direct.classNo}
                  onChange={(event) => {
                    setDirect((current) => ({ ...current, classNo: event.target.value }));
                    setSearch('');
                    setSearchOpen(false);
                    directMutation.reset();
                  }}
                />
              </FormField>
              <FormField label="번호">
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={direct.number}
                  onChange={(event) => {
                    setDirect((current) => ({ ...current, number: event.target.value }));
                    setSearch('');
                    setSearchOpen(false);
                    directMutation.reset();
                  }}
                />
              </FormField>
              <Button
                variant="secondary"
                disabled={!directReady}
                loading={directMutation.isPending}
                onClick={() => directMutation.mutate()}
              >
                추가
              </Button>
            </div>
            {directValidation ? (
              <p className="form-error point-award-error">{directValidation}</p>
            ) : directNotFound ? (
              <p className="form-error point-award-error">
                입력한 학년·반·번호에 해당하는 학생이 없습니다.
              </p>
            ) : null}
            {selectedStudents.length ? (
              <div className="point-selected-student">
                <strong>선택 학생 {selectedStudents.length}명</strong>
                <div className="point-selected-student-list">
                  {selectedStudents.map((student) => (
                    <span className="point-selected-student-chip" key={student.id}>
                      {student.studentNo} {student.name}
                      <button
                        type="button"
                        aria-label={`${student.studentNo} ${student.name} 선택 해제`}
                        onClick={() => removeStudentSelection(student.id)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="point-award-fields">
            <FormField label="기준 규정" required>
              <select
                value={form.reasonId}
                onChange={(event) => {
                  const reason = activeReasons.find(
                    (item) => item.id === Number(event.target.value),
                  );
                  setForm((current) => ({
                    ...current,
                    reasonId: event.target.value,
                    point: reason ? String(reason.point) : '',
                    reasonText: reason?.comment ?? '',
                  }));
                }}
                required
              >
                <option value="">사유 선택</option>
                {activeReasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.id} · {reasonTypeLabel[reason.type]} · {reason.comment}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="점수" required>
              <input
                type="number"
                min={-100}
                max={100}
                value={form.point}
                onChange={(event) =>
                  setForm((current) => ({ ...current, point: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="기준일" required>
              <input
                type="date"
                value={form.baseDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, baseDate: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="사유" className="point-award-reason" required>
              <input
                value={form.reasonText}
                maxLength={255}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reasonText: event.target.value }))
                }
                required
              />
            </FormField>
            <Button
              type="submit"
              variant="primary"
              disabled={selectedStudents.length === 0 || !selectedReason}
            >
              {editKey ? '저장' : '추가'}
            </Button>
          </div>
        </form>
      </section>

      <section className="admin-panel point-panel">
        <TableToolbar summary={`${queue.length}건`}>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleImport}
          />
          <Button variant="secondary" onClick={() => void downloadImportTemplate(activeReasons)}>
            엑셀 양식 다운로드
          </Button>
          <Button
            variant="secondary"
            loading={importMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            엑셀 업로드
          </Button>
        </TableToolbar>
        {importErrors.length > 0 ? (
          <div className="point-import-errors" role="alert">
            {importErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        <DataTable
          columns={queueColumns}
          data={queue}
          emptyText="추가된 기록이 없습니다."
          pageSize={20}
          getRowId={(row) => row.key}
        />
        <div className="point-panel-actions">
          <div>
            {feedback ? <p className="point-feedback">{feedback}</p> : null}
            {submitMutation.isError ? (
              <p className="form-error">{submitMutation.error.message}</p>
            ) : null}
          </div>
          <div className="point-panel-action-buttons">
            <Button
              className="point-action"
              variant="danger"
              disabled={selectedKeys.size === 0 || submitMutation.isPending}
              onClick={deleteSelectedRows}
            >
              <Trash2 size={16} aria-hidden="true" />
              선택 삭제{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}
            </Button>
            <Button
              className="point-action"
              variant="primary"
              disabled={queue.length === 0}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              <Check size={17} aria-hidden="true" />
              적용
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
