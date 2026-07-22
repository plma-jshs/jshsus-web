import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminSummary,
  ActivityRequestParticipant,
  ActivityRequestPrintBatch,
  ActivityRequestStudentOption,
} from '@jshsus/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, FilePlus2, Printer, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  Button,
  Drawer,
  PageSizeSelect,
  RowActionButton,
  RowActions,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import {
  formatActivityDate,
  formatActivityDateTime,
  useActivityRequests,
  useRefreshActivityRequests,
} from './activityRequests';
import {
  activitySlotsDateTimes,
  availableActivityTimeSlots,
  koreaDateInput,
  type ActivityTimeSlotId,
} from './activitySchedule';
import './operations.css';

type CreateActivityForm = {
  representativeStudentNo: number | null;
  participantStudentNos: number[];
  location: string;
  activityDate: string;
  activitySlotIds: ActivityTimeSlotId[];
  purpose: string;
};

function createInitialActivityForm(): CreateActivityForm {
  const activityDate = koreaDateInput();
  const [firstSlot] = availableActivityTimeSlots(activityDate);
  return {
    representativeStudentNo: null,
    participantStudentNos: [],
    location: '',
    activityDate,
    activitySlotIds: firstSlot ? [firstSlot.id] : ['evening-1'],
    purpose: '',
  };
}

function participantPairs(participants: ActivityRequestParticipant[]) {
  const midpoint = Math.ceil(participants.length / 2);
  return Array.from(
    { length: midpoint },
    (_, index) => [participants[index], participants[index + midpoint]] as const,
  );
}

function ParticipantCell({ participant }: { participant?: ActivityRequestParticipant }) {
  if (!participant) return <td colSpan={2} />;
  return (
    <>
      <td>{participant.studentNo}</td>
      <td>
        {participant.studentName}
        {participant.isRepresentative ? <span className="print-representative">대표</span> : null}
      </td>
    </>
  );
}

function ActivityPermitDocument({ request }: { request: ActivityRequestAdminSummary }) {
  const participants = request.participants.length
    ? request.participants
    : [
        {
          studentId: request.representativeStudentId,
          studentNo: request.studentNo,
          studentName: request.studentName,
          isRepresentative: true,
        },
      ];

  return (
    <article className="activity-permit-document">
      <header className="activity-permit-document__header">
        <div>
          <span>전남과학고등학교</span>
          <h1>탐구활동서</h1>
        </div>
        <dl>
          <div>
            <dt>발급번호</dt>
            <dd>{request.issuedNumber ?? '-'}</dd>
          </div>
          <div>
            <dt>발급일</dt>
            <dd>{request.issuedAt ? formatActivityDate(request.issuedAt) : '-'}</dd>
          </div>
        </dl>
      </header>

      <table className="activity-permit-document__summary">
        <tbody>
          <tr>
            <th>대표 학생</th>
            <td>
              {request.studentNo} {request.studentName}
            </td>
            <th>참여 인원</th>
            <td>{participants.length}명</td>
          </tr>
          <tr>
            <th>활동 일시</th>
            <td colSpan={3}>
              {formatActivityDateTime(request.startsAt)} – {formatActivityDateTime(request.endsAt)}
            </td>
          </tr>
          <tr>
            <th>장소</th>
            <td colSpan={3}>{request.location}</td>
          </tr>
          <tr>
            <th>활동 목적</th>
            <td colSpan={3}>{request.purpose}</td>
          </tr>
        </tbody>
      </table>

      <section className="activity-permit-document__section">
        <h2>참여 학생</h2>
        <table className="activity-permit-document__participants">
          <thead>
            <tr>
              <th>학번</th>
              <th>이름</th>
              <th>학번</th>
              <th>이름</th>
            </tr>
          </thead>
          <tbody>
            {participantPairs(participants).map(([left, right], index) => (
              <tr key={`${left?.studentId ?? 'empty'}-${right?.studentId ?? index}`}>
                <ParticipantCell participant={left} />
                <ParticipantCell participant={right} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="activity-permit-document__section">
        <h2>작성 및 승인</h2>
        <table>
          <thead>
            <tr>
              <th>작성자</th>
              <th>담당 교사</th>
              <th>승인자</th>
              <th>작성일</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{request.creatorName ?? '-'}</td>
              <td>{request.advisorTeacherName ?? '-'}</td>
              <td>{request.reviewerName ?? '-'}</td>
              <td>{request.createdAt ? formatActivityDate(request.createdAt) : '-'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <p className="activity-permit-document__confirmation">위 학생들의 탐구활동을 승인합니다.</p>
      <footer>
        <span>{request.issuedAt ? formatActivityDate(request.issuedAt) : ''}</span>
        <strong>전남과학고등학교</strong>
      </footer>
    </article>
  );
}

export function ActivityReviewPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startsAt', desc: true }]);
  const sort = sorting[0];
  const requestsQuery = useActivityRequests({
    page,
    pageSize: pageSize as 20 | 50 | 100,
    search: search || undefined,
    status: 'pending',
    assignedToMe: true,
    sortBy: (sort?.id as ActivityRequestAdminListQuery['sortBy']) ?? 'startsAt',
    sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : 'desc',
  });
  const refreshActivityRequests = useRefreshActivityRequests();
  const [rejectForm, setRejectForm] = useState({ id: 0, reason: '' });
  const [printBatch, setPrintBatch] = useState<ActivityRequestPrintBatch | null>(null);
  const [printMessage, setPrintMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateActivityForm>(createInitialActivityForm);
  const [studentSearch, setStudentSearch] = useState('');
  const pendingRequests = useMemo(
    () => requestsQuery.data?.items ?? [],
    [requestsQuery.data?.items],
  );
  const studentsQuery = useQuery({
    queryKey: ['activity-request-students'],
    queryFn: api.activityRequestStudents,
    enabled: createOpen,
    staleTime: 5 * 60 * 1000,
  });
  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);
  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLocaleLowerCase('ko-KR');
    if (!keyword) return students;
    return students.filter((student) =>
      `${student.studentNo} ${student.studentName}`.toLocaleLowerCase('ko-KR').includes(keyword),
    );
  }, [studentSearch, students]);
  const selectedStudentNos = new Set([
    ...(createForm.representativeStudentNo ? [createForm.representativeStudentNo] : []),
    ...createForm.participantStudentNos,
  ]);
  const studentByNo = useMemo(
    () => new Map(students.map((student) => [student.studentNo, student])),
    [students],
  );
  const availableSlots = useMemo(
    () => availableActivityTimeSlots(createForm.activityDate),
    [createForm.activityDate],
  );

  const approveMutation = useMutation({
    mutationFn: api.approveActivityRequest,
    onSuccess: async () => {
      await refreshActivityRequests();
      showToast({ title: '탐구활동서를 승인했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '탐구활동서를 승인하지 못했습니다.', tone: 'danger' }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.rejectActivityRequest(id, reason),
    onSuccess: async () => {
      setRejectForm({ id: 0, reason: '' });
      await refreshActivityRequests();
      showToast({ title: '탐구활동서를 반려했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '탐구활동서를 반려하지 못했습니다.', tone: 'danger' }),
  });
  const printMutation = useMutation({
    mutationFn: () => api.printTodayActivityRequests(),
    onSuccess: (result) => {
      setPrintBatch(result);
      if (result.documents.length === 0) {
        setPrintMessage('오늘 활동하는 승인 완료 탐구활동서가 없습니다.');
        showToast({ title: '오늘 인쇄할 탐구활동서가 없습니다.', tone: 'warning' });
        return;
      }
      setPrintMessage('');
      showToast({
        title: `${result.documents.length}건의 인쇄 화면을 준비했습니다.`,
        tone: 'success',
      });
      window.setTimeout(() => window.print(), 50);
    },
    onError: () => showToast({ title: '인쇄 자료를 준비하지 못했습니다.', tone: 'danger' }),
  });
  const createMutation = useMutation({
    mutationFn: (form: CreateActivityForm) => {
      if (!form.representativeStudentNo) {
        throw new Error('대표 학생을 선택해 주세요.');
      }
      const activityTimes = activitySlotsDateTimes(form.activityDate, form.activitySlotIds);
      if (!activityTimes) {
        throw new Error('선택한 날짜에 이용 가능한 면학 시간을 하나 이상 선택해 주세요.');
      }
      return api.createActivityRequest({
        representativeStudentNo: form.representativeStudentNo,
        participantStudentNos: form.participantStudentNos,
        location: form.location.trim(),
        activitySlotIds: activityTimes.activitySlotIds,
        startsAt: activityTimes.startsAt,
        endsAt: activityTimes.endsAt,
        purpose: form.purpose.trim(),
      });
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateForm(createInitialActivityForm());
      setStudentSearch('');
      await refreshActivityRequests();
      showToast({ title: '탐구활동서를 발급했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '탐구활동서를 발급하지 못했습니다.',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      }),
  });

  const selectRepresentative = (student: ActivityRequestStudentOption) => {
    setCreateForm((form) => ({
      ...form,
      representativeStudentNo: student.studentNo,
      participantStudentNos: form.participantStudentNos.filter(
        (studentNo) => studentNo !== student.studentNo,
      ),
    }));
  };

  const addParticipant = (student: ActivityRequestStudentOption) => {
    if (selectedStudentNos.has(student.studentNo)) return;
    setCreateForm((form) => ({
      ...form,
      participantStudentNos: [...form.participantStudentNos, student.studentNo],
    }));
  };

  const toggleCreateActivitySlot = (slotId: ActivityTimeSlotId) => {
    setCreateForm((form) => {
      const selected = form.activitySlotIds.includes(slotId)
        ? form.activitySlotIds.filter((id) => id !== slotId)
        : [...form.activitySlotIds, slotId];
      return {
        ...form,
        activitySlotIds: selected.length > 0 ? selected : form.activitySlotIds,
      };
    });
  };

  const columns: ColumnDef<ActivityRequestAdminSummary>[] = [
    {
      id: 'representative',
      accessorFn: (request) => `${request.studentNo} ${request.studentName}`,
      header: '대표 학생',
      cell: ({ row }) => (
        <strong>
          {row.original.studentNo} {row.original.studentName}
        </strong>
      ),
      meta: { minWidth: 120, maxWidth: 150 },
    },
    {
      id: 'participantCount',
      accessorFn: (request) => request.participants.length,
      header: '참여 인원',
      enableSorting: false,
      cell: ({ getValue }) => `${getValue<number>()}명`,
      meta: { width: 125, align: 'center' },
    },
    {
      accessorKey: 'purpose',
      header: '활동 목적',
      enableSorting: false,
      meta: { minWidth: 320, maxWidth: 560, truncate: true },
    },
    {
      accessorKey: 'location',
      header: '장소',
      enableSorting: false,
      meta: { minWidth: 96, maxWidth: 130, truncate: true },
    },
    {
      accessorKey: 'startsAt',
      header: '활동 일시',
      cell: ({ getValue }) => formatActivityDateTime(getValue<string>()),
      meta: { width: 175, align: 'center' },
    },
    {
      accessorKey: 'advisorTeacherName',
      header: '담당 교사',
      enableSorting: false,
      cell: ({ getValue }) => getValue<string | undefined>() ?? '-',
      meta: { width: 110, align: 'center' },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions>
          <RowActionButton
            icon={<Check size={14} aria-hidden="true" />}
            label="탐구활동서 승인"
            variant="primary"
            onClick={() => approveMutation.mutate(row.original.id)}
            disabled={approveMutation.isPending}
          />
          <RowActionButton
            icon={<X size={14} aria-hidden="true" />}
            label="탐구활동서 반려"
            variant="danger"
            onClick={() => setRejectForm({ id: row.original.id, reason: '' })}
          />
        </RowActions>
      ),
      meta: { width: 92, align: 'center' },
    },
  ];

  const handleReject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rejectForm.reason.trim()) {
      rejectMutation.mutate({ id: rejectForm.id, reason: rejectForm.reason.trim() });
    }
  };

  return (
    <div className="admin-stack operation-page operation-review-layout">
      <AdminListPanel
        title="탐구활동서 승인"
        toolbar={
          <TableToolbar
            summary={
              requestsQuery.data ? `대기 ${requestsQuery.data.total}건` : '승인 대기 탐구활동서'
            }
            className="operation-list-toolbar operation-review-toolbar"
          >
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="학생, 담당 교사, 장소, 활동 목적 검색"
              aria-label="승인 대기 탐구활동서 검색"
            />
            <PageSizeSelect
              value={pageSize}
              onChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
            <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
              <FilePlus2 size={16} aria-hidden="true" />
              신규 작성
            </Button>
            <Button
              type="button"
              onClick={() => printMutation.mutate()}
              disabled={printMutation.isPending}
            >
              <Printer size={16} aria-hidden="true" />
              오늘자 전체 인쇄
            </Button>
          </TableToolbar>
        }
        className="operation-review-list"
      >
        {printMessage ? <p className="operation-inline-message">{printMessage}</p> : null}
        {printMutation.isError ? (
          <p className="form-error">오늘자 탐구활동서를 준비하지 못했습니다.</p>
        ) : null}
        {requestsQuery.isError ? (
          <p className="form-error">승인 대상 탐구활동서를 불러오지 못했습니다.</p>
        ) : (
          <DataTable
            columns={columns}
            data={pendingRequests}
            sorting={sorting}
            onSortingChange={(updater) => {
              setSorting((current) => (typeof updater === 'function' ? updater(current) : updater));
              setPage(1);
            }}
            manualSorting
            pagination={{
              pageIndex: page - 1,
              pageSize,
              pageCount: requestsQuery.data?.totalPages ?? 1,
              totalCount: requestsQuery.data?.total,
              onPageChange: (nextPage) => setPage(nextPage + 1),
            }}
            loading={requestsQuery.isPending}
            loadingText="승인 대상을 불러오는 중입니다."
            emptyText="승인 대기 중인 탐구활동서가 없습니다."
            alwaysShowPagination
            caption="승인 대기 탐구활동서"
            getRowId={(request) => String(request.id)}
          />
        )}
      </AdminListPanel>

      {rejectForm.id > 0 ? (
        <section className="admin-panel operation-review-aside">
          <div className="panel-title operation-panel-heading">
            <h2>반려 사유</h2>
          </div>
          <form className="operation-reject-form" onSubmit={handleReject}>
            <label>
              <span>반려 사유</span>
              <textarea
                value={rejectForm.reason}
                onChange={(event) =>
                  setRejectForm((form) => ({ ...form, reason: event.target.value }))
                }
                maxLength={500}
                required
              />
            </label>
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={rejectMutation.isPending}>
                반려
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => setRejectForm({ id: 0, reason: '' })}
                disabled={rejectMutation.isPending}
              >
                취소
              </button>
            </div>
          </form>
          {rejectMutation.isError ? <p className="form-error">반려 처리에 실패했습니다.</p> : null}
        </section>
      ) : null}

      <Drawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          createMutation.reset();
        }}
        title="탐구활동서 작성"
        footer={
          <>
            <Button type="button" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button
              type="submit"
              form="activity-request-create-form"
              variant="primary"
              loading={createMutation.isPending}
            >
              작성
            </Button>
          </>
        }
        className="activity-create-drawer"
      >
        <form
          id="activity-request-create-form"
          className="activity-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate(createForm);
          }}
        >
          <section className="activity-create-section activity-student-picker">
            <header>
              <h3>참여 학생</h3>
              <p>대표 학생 한 명과 함께 활동할 학생을 선택하세요.</p>
            </header>
            <label>
              <span>학생 검색</span>
              <input
                type="search"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="학번 또는 이름"
              />
            </label>
            <div className="activity-student-results" role="list" aria-label="학생 검색 결과">
              {studentsQuery.isPending ? <p>학생을 불러오는 중입니다.</p> : null}
              {studentsQuery.isError ? (
                <p className="form-error">학생을 불러오지 못했습니다.</p>
              ) : null}
              {!studentsQuery.isPending && filteredStudents.length === 0 ? (
                <p>검색 결과가 없습니다.</p>
              ) : null}
              {filteredStudents.map((student) => (
                <div key={student.studentId} role="listitem">
                  <span>
                    {student.studentNo} {student.studentName}
                  </span>
                  <div>
                    <button type="button" onClick={() => selectRepresentative(student)}>
                      대표
                    </button>
                    <button
                      type="button"
                      onClick={() => addParticipant(student)}
                      disabled={selectedStudentNos.has(student.studentNo)}
                    >
                      추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="activity-create-section activity-selected-students"
            aria-label="선택한 학생"
          >
            <h3>선택한 학생</h3>
            {createForm.representativeStudentNo ? (
              <div className="activity-student-chip activity-student-chip--representative">
                <span>
                  대표 · {createForm.representativeStudentNo}{' '}
                  {studentByNo.get(createForm.representativeStudentNo)?.studentName}
                </span>
              </div>
            ) : (
              <p>대표 학생을 선택해 주세요.</p>
            )}
            {createForm.participantStudentNos.map((studentNo) => (
              <div className="activity-student-chip" key={studentNo}>
                <span>
                  {studentNo} {studentByNo.get(studentNo)?.studentName}
                </span>
                <button
                  type="button"
                  aria-label={`${studentNo} 참여 학생 제거`}
                  onClick={() =>
                    setCreateForm((form) => ({
                      ...form,
                      participantStudentNos: form.participantStudentNos.filter(
                        (value) => value !== studentNo,
                      ),
                    }))
                  }
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </section>

          <section className="activity-create-section activity-create-schedule">
            <header>
              <h3>활동 시간</h3>
            </header>
            <div className="activity-create-form__grid">
              <label>
                <span>활동 날짜</span>
                <input
                  type="date"
                  value={createForm.activityDate}
                  min={koreaDateInput()}
                  onChange={(event) => {
                    const nextSlots = availableActivityTimeSlots(event.target.value);
                    const nextSlotIds = new Set(nextSlots.map((slot) => slot.id));
                    setCreateForm((form) => {
                      const selectedSlotIds = form.activitySlotIds.filter((slotId) =>
                        nextSlotIds.has(slotId),
                      );
                      return {
                        ...form,
                        activityDate: event.target.value,
                        activitySlotIds: selectedSlotIds.length
                          ? selectedSlotIds
                          : nextSlots[0]
                            ? [nextSlots[0].id]
                            : ['evening-1'],
                      };
                    });
                  }}
                  required
                />
              </label>
              <fieldset className="activity-slot-picker">
                <legend>면학 시간</legend>
                <div className="activity-slot-pill-list">
                  {availableSlots.map((slot) => {
                    const checked = createForm.activitySlotIds.includes(slot.id);
                    return (
                      <label className={checked ? 'is-selected' : undefined} key={slot.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCreateActivitySlot(slot.id)}
                        />
                        <span>{slot.label}</span>
                        <small>
                          {slot.startsAt}~{slot.endsAt}
                        </small>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </section>
          <section className="activity-create-section activity-create-details">
            <header>
              <h3>활동 내용</h3>
              <p>허가서에 표시될 장소와 목적을 입력하세요.</p>
            </header>
            <div className="activity-create-form__grid activity-create-form__grid--details">
              <label>
                <span>장소</span>
                <input
                  value={createForm.location}
                  onChange={(event) =>
                    setCreateForm((form) => ({ ...form, location: event.target.value }))
                  }
                  maxLength={160}
                  required
                />
              </label>
              <label>
                <span>활동 목적</span>
                <textarea
                  value={createForm.purpose}
                  onChange={(event) =>
                    setCreateForm((form) => ({ ...form, purpose: event.target.value }))
                  }
                  maxLength={500}
                  required
                />
              </label>
            </div>
          </section>
          {createMutation.isError ? (
            <p className="form-error">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : '탐구활동서를 작성하지 못했습니다.'}
            </p>
          ) : null}
        </form>
      </Drawer>

      <section className="activity-print-batch" aria-hidden="true">
        {printBatch?.documents.map((request) => (
          <ActivityPermitDocument key={request.id} request={request} />
        ))}
      </section>
    </div>
  );
}
