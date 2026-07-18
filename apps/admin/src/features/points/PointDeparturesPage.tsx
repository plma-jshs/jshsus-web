import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, LogOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  Button,
  Dialog,
  FormField,
  PageSizeSelect,
  SegmentedTabs,
  TableToolbar,
  useToast,
} from '../../components/ui';
import {
  pointsApi,
  type DepartureCandidate,
  type DepartureHistoryRow,
  type SemesterHalfPreview,
  type SemesterHalfPreviewItem,
} from './pointsApi';
import './points.css';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(value))
    .replace(/\.$/, '');
}

export function PointDeparturesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'departures' | 'semester'>('departures');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [classNo, setClassNo] = useState('');
  const [riskStatus, setRiskStatus] = useState<'risk' | 'departure' | 'all'>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [historySorting, setHistorySorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<DepartureCandidate | null>(null);
  const [memo, setMemo] = useState('');
  const [baseDate, setBaseDate] = useState(today);
  const [feedback, setFeedback] = useState('');
  const [semesterForm, setSemesterForm] = useState({
    schoolYear: String(new Date().getFullYear()),
    semester: '1',
    baseDate: today,
  });
  const [preview, setPreview] = useState<SemesterHalfPreview | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const sort = sorting[0];
  const historySort = historySorting[0];

  const candidatesQuery = useQuery({
    queryKey: [
      'point-departure-candidates',
      page,
      pageSize,
      search,
      grade,
      classNo,
      riskStatus,
      sort?.id,
      sort?.desc,
    ],
    queryFn: () =>
      pointsApi.departureCandidates({
        page,
        pageSize,
        search: search || undefined,
        grade: grade ? Number(grade) : undefined,
        classNo: classNo ? Number(classNo) : undefined,
        riskStatus,
        sortBy:
          (sort?.id as
            'studentNo' | 'name' | 'meritPoint' | 'penaltyPoint' | 'currentPoint' | undefined) ??
          'currentPoint',
        sortOrder: sort?.desc ? 'desc' : 'asc',
      }),
    enabled: tab === 'departures',
  });
  const historyQuery = useQuery({
    queryKey: [
      'point-departure-history',
      historyPage,
      pageSize,
      search,
      grade,
      classNo,
      historySort?.id,
      historySort?.desc,
    ],
    queryFn: () =>
      pointsApi.departureHistory({
        page: historyPage,
        pageSize,
        search: search || undefined,
        grade: grade ? Number(grade) : undefined,
        classNo: classNo ? Number(classNo) : undefined,
        sortBy: (historySort?.id as 'studentNo' | 'name' | 'handledAt' | undefined) ?? 'handledAt',
        sortOrder: historySort?.desc ? 'desc' : 'asc',
      }),
    enabled: tab === 'departures',
  });
  const approveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('학생을 선택해 주세요.');
      return pointsApi.approveDeparture(selected.id, { memo, baseDate });
    },
    onSuccess: async () => {
      const description = `${selected?.studentNo ?? ''} 퇴사를 승인하고 상벌점을 0점으로 초기화했습니다.`;
      setFeedback(description);
      showToast({ title: '퇴사 승인 완료', description, tone: 'success' });
      setSelected(null);
      setMemo('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-departure-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['point-departure-history'] }),
        queryClient.invalidateQueries({ queryKey: ['point-student-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-record-page'] }),
      ]);
    },
    onError: (error) => {
      showToast({
        title: '퇴사 승인을 완료하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });
  const previewMutation = useMutation({
    mutationFn: () =>
      pointsApi.previewSemesterHalf({
        schoolYear: Number(semesterForm.schoolYear),
        semester: Number(semesterForm.semester),
        baseDate: semesterForm.baseDate,
      }),
    onSuccess: (result) => {
      setPreview(result);
      setFeedback('');
      showToast({ title: '새학기 상벌점 반감 미리보기를 만들었습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '반감 미리보기를 만들지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });
  const applyMutation = useMutation({
    mutationFn: () =>
      pointsApi.applySemesterHalf({
        schoolYear: Number(semesterForm.schoolYear),
        semester: Number(semesterForm.semester),
        baseDate: semesterForm.baseDate,
      }),
    onSuccess: async (result) => {
      setApplyOpen(false);
      setPreview(null);
      setFeedback(
        result.replayed
          ? '이미 처리한 학기입니다. 중복 적용하지 않았습니다.'
          : `${result.adjustedStudentCount}명의 조정 원장 ${result.recordCount}건을 생성했습니다.`,
      );
      showToast({
        title: result.replayed ? '이미 처리된 학기입니다.' : '새학기 반감 적용 완료',
        description: result.replayed
          ? '중복 적용하지 않았습니다.'
          : `${result.adjustedStudentCount}명의 조정 원장 ${result.recordCount}건을 생성했습니다.`,
        tone: result.replayed ? 'info' : 'success',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['point-student-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-record-page'] }),
        queryClient.invalidateQueries({ queryKey: ['point-departure-candidates'] }),
      ]);
    },
    onError: (error) => {
      showToast({
        title: '새학기 반감을 적용하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      });
    },
  });

  const candidateColumns = useMemo<ColumnDef<DepartureCandidate>[]>(
    () => [
      { accessorKey: 'studentNo', header: '학번', meta: { align: 'center', width: 120 } },
      {
        accessorKey: 'name',
        header: '이름',
        cell: ({ row }) => <strong>{row.original.name}</strong>,
        meta: { align: 'center', width: 130 },
      },
      {
        accessorKey: 'meritPoint',
        header: '상점 합계',
        meta: { align: 'center', width: 130 },
      },
      {
        accessorKey: 'penaltyPoint',
        header: '벌점 합계',
        meta: { align: 'center', width: 130 },
      },
      {
        accessorKey: 'currentPoint',
        header: '순합계',
        cell: ({ row }) => (
          <strong className="point-value--danger">{row.original.currentPoint}</strong>
        ),
        meta: { align: 'center', width: 120 },
      },
      {
        id: 'actions',
        header: '작업',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.currentPoint <= -20 ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setSelected(row.original);
                setMemo('');
                setBaseDate(today);
              }}
            >
              <LogOut size={15} aria-hidden="true" />
              퇴사 승인
            </Button>
          ) : (
            <span className="point-system-label">-20점부터 승인 가능</span>
          ),
        meta: { align: 'center', width: 180 },
      },
    ],
    [],
  );
  const historyColumns = useMemo<ColumnDef<DepartureHistoryRow>[]>(
    () => [
      { accessorKey: 'studentNo', header: '학번', meta: { align: 'center', width: 120 } },
      { accessorKey: 'name', header: '이름', meta: { align: 'center', width: 130 } },
      {
        accessorKey: 'handledAt',
        header: '처리일시',
        cell: ({ row }) => formatDateTime(row.original.handledAt),
        meta: { align: 'center', width: 190 },
      },
      {
        accessorKey: 'handledBy',
        header: '처리자',
        enableSorting: false,
        cell: ({ row }) => row.original.handledBy || '-',
        meta: { align: 'center', width: 150 },
      },
      {
        accessorKey: 'memo',
        header: '사유',
        enableSorting: false,
        cell: ({ row }) => row.original.memo || '-',
      },
    ],
    [],
  );
  const previewColumns = useMemo<ColumnDef<SemesterHalfPreviewItem>[]>(
    () => [
      { accessorKey: 'studentNo', header: '학번', meta: { align: 'center', width: 110 } },
      { accessorKey: 'name', header: '이름', meta: { align: 'center', width: 120 } },
      {
        id: 'merit',
        header: '상점',
        cell: ({ row }) => `${row.original.meritBefore} → ${row.original.meritAfter}`,
        meta: { align: 'center' },
      },
      {
        id: 'penalty',
        header: '벌점',
        cell: ({ row }) => `${row.original.penaltyBefore} → ${row.original.penaltyAfter}`,
        meta: { align: 'center' },
      },
      {
        id: 'net',
        header: '순합계',
        cell: ({ row }) => `${row.original.currentPoint} → ${row.original.afterPoint}`,
        meta: { align: 'center' },
      },
    ],
    [],
  );

  const resetPages = () => {
    setPage(1);
    setHistoryPage(1);
  };

  return (
    <>
      <SegmentedTabs
        value={tab}
        ariaLabel="퇴사 및 학기 조정"
        options={[
          { value: 'departures', label: '퇴사자 관리' },
          { value: 'semester', label: '새학기 상벌점 반감' },
        ]}
        onChange={setTab}
      />

      {feedback ? <p className="point-page-feedback">{feedback}</p> : null}

      {tab === 'departures' ? (
        <div className="admin-stack">
          <AdminListPanel
            className="point-panel"
            title="처리 대상"
            toolbar={
              <TableToolbar
                summary={candidatesQuery.data ? `총 ${candidatesQuery.data.total}명` : undefined}
              >
                <label className="point-filter point-filter--search">
                  <span>검색</span>
                  <input
                    value={search}
                    placeholder="학번 또는 이름"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      resetPages();
                    }}
                  />
                </label>
                <label className="point-filter">
                  <span>학년</span>
                  <select
                    value={grade}
                    onChange={(event) => {
                      setGrade(event.target.value);
                      resetPages();
                    }}
                  >
                    <option value="">전체</option>
                    {[1, 2, 3, 9].map((value) => (
                      <option key={value} value={value}>
                        {value}학년
                      </option>
                    ))}
                  </select>
                </label>
                <label className="point-filter">
                  <span>반</span>
                  <select
                    value={classNo}
                    onChange={(event) => {
                      setClassNo(event.target.value);
                      resetPages();
                    }}
                  >
                    <option value="">전체</option>
                    {Array.from({ length: 4 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>
                        {value}반
                      </option>
                    ))}
                  </select>
                </label>
                <label className="point-filter">
                  <span>대상</span>
                  <select
                    value={riskStatus}
                    onChange={(event) => {
                      setRiskStatus(event.target.value as typeof riskStatus);
                      setPage(1);
                    }}
                  >
                    <option value="all">전체</option>
                    <option value="risk">퇴사 위험</option>
                    <option value="departure">승인 가능</option>
                  </select>
                </label>
                <PageSizeSelect
                  value={pageSize}
                  onChange={(value) => {
                    setPageSize(value);
                    resetPages();
                  }}
                />
              </TableToolbar>
            }
          >
            <DataTable
              columns={candidateColumns}
              data={candidatesQuery.data?.items ?? []}
              loading={candidatesQuery.isLoading}
              emptyText={
                candidatesQuery.isError ? candidatesQuery.error.message : '조회된 학생이 없습니다.'
              }
              sorting={sorting}
              onSortingChange={(updater) => {
                setSorting((current) =>
                  typeof updater === 'function' ? updater(current) : updater,
                );
                setPage(1);
              }}
              manualSorting
              pagination={{
                pageIndex: page - 1,
                pageSize,
                pageCount: candidatesQuery.data?.totalPages ?? 1,
                totalCount: candidatesQuery.data?.total,
                onPageChange: (nextPage) => setPage(nextPage + 1),
              }}
              alwaysShowPagination
              getRowId={(row) => String(row.id)}
            />
          </AdminListPanel>

          <AdminListPanel className="point-panel" title="퇴사 완료">
            <DataTable
              columns={historyColumns}
              data={historyQuery.data?.items ?? []}
              loading={historyQuery.isLoading}
              emptyText={
                historyQuery.isError ? historyQuery.error.message : '퇴사 처리 이력이 없습니다.'
              }
              sorting={historySorting}
              onSortingChange={(updater) => {
                setHistorySorting((current) =>
                  typeof updater === 'function' ? updater(current) : updater,
                );
                setHistoryPage(1);
              }}
              manualSorting
              pagination={{
                pageIndex: historyPage - 1,
                pageSize,
                pageCount: historyQuery.data?.totalPages ?? 1,
                totalCount: historyQuery.data?.total,
                onPageChange: (nextPage) => setHistoryPage(nextPage + 1),
              }}
              alwaysShowPagination
              getRowId={(row) => String(row.id)}
            />
          </AdminListPanel>
        </div>
      ) : (
        <div className="admin-stack">
          <section className="admin-panel point-panel">
            <form
              className="point-semester-form"
              onSubmit={(event) => {
                event.preventDefault();
                previewMutation.mutate();
              }}
            >
              <FormField label="학년도" required>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={semesterForm.schoolYear}
                  onChange={(event) => {
                    setSemesterForm((current) => ({ ...current, schoolYear: event.target.value }));
                    setPreview(null);
                  }}
                />
              </FormField>
              <FormField label="학기" required>
                <select
                  value={semesterForm.semester}
                  onChange={(event) => {
                    setSemesterForm((current) => ({ ...current, semester: event.target.value }));
                    setPreview(null);
                  }}
                >
                  <option value="1">1학기</option>
                  <option value="2">2학기</option>
                </select>
              </FormField>
              <FormField label="기준일" required>
                <input
                  type="date"
                  value={semesterForm.baseDate}
                  onChange={(event) => {
                    setSemesterForm((current) => ({ ...current, baseDate: event.target.value }));
                    setPreview(null);
                  }}
                />
              </FormField>
              <Button type="submit" variant="secondary" loading={previewMutation.isPending}>
                미리보기
              </Button>
            </form>
            {previewMutation.isError ? (
              <p className="form-error">{previewMutation.error.message}</p>
            ) : null}
          </section>

          {preview ? (
            <AdminListPanel
              className="point-panel"
              toolbar={
                <TableToolbar
                  summary={
                    preview.alreadyApplied
                      ? `${preview.operationId} · 처리 완료`
                      : `${preview.adjustedStudentCount}명 · 원장 ${preview.recordCount}건`
                  }
                >
                  <Button
                    variant="primary"
                    disabled={preview.alreadyApplied || preview.items.length === 0}
                    onClick={() => setApplyOpen(true)}
                  >
                    적용
                  </Button>
                </TableToolbar>
              }
            >
              <DataTable
                columns={previewColumns}
                data={preview.items}
                emptyText={
                  preview.alreadyApplied ? '이미 처리한 학기입니다.' : '조정할 학생이 없습니다.'
                }
                pageSize={20}
                alwaysShowPagination
                getRowId={(row) => String(row.studentId)}
              />
            </AdminListPanel>
          ) : null}
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="퇴사 승인"
        description={
          selected
            ? `${selected.studentNo} ${selected.name} · ${selected.currentPoint}점`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              disabled={!memo.trim()}
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              퇴사 승인
            </Button>
          </>
        }
      >
        <div className="point-dialog-form">
          <FormField label="기준일" required>
            <input
              type="date"
              value={baseDate}
              onChange={(event) => setBaseDate(event.target.value)}
            />
          </FormField>
          <FormField label="사유" required error={approveMutation.error?.message}>
            <textarea
              rows={4}
              maxLength={2000}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </FormField>
          <p className="point-dialog-copy">
            승인하면 상벌점을 0점으로 초기화하고 처리 이력을 남깁니다.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="새학기 상벌점 반감"
        description={
          preview ? `${preview.operationId} · ${preview.adjustedStudentCount}명` : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApplyOpen(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              <Check size={17} aria-hidden="true" />
              적용
            </Button>
          </>
        }
      >
        <p className="point-dialog-copy">
          상점과 벌점을 각각 절반으로 내림 처리합니다. 같은 학기는 중복 적용할 수 없습니다.
        </p>
        {applyMutation.isError ? <p className="form-error">{applyMutation.error.message}</p> : null}
      </Dialog>
    </>
  );
}
