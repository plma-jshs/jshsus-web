import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminSummary,
  ActivityRequestStudentOption,
} from '@jshsus/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Check, LoaderCircle, X } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import {
  AdminListPanel,
  AdminSearchField,
  Button,
  DialogActions,
  Drawer,
  RowActionButton,
  RowActions,
  TableToolbar,
  useToast,
} from '../../components/ui';
import { api } from '../../shared/api/adminApi';
import {
  formatActivityDateTime,
  useActivityRequests,
  useRefreshActivityRequests,
} from './activityRequests';
import {
  activitySlotsDateTimes,
  availableActivityTimeSlots,
  isWeekendActivityDate,
  koreaDateInput,
  type ActivityTimeSlotId,
} from './activitySchedule';
import { ActivityParticipants } from './ActivityParticipants';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateActivityForm>(createInitialActivityForm);
  const [studentSearch, setStudentSearch] = useState('');
  const [showDaytimeSlots, setShowDaytimeSlots] = useState(false);
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
    () => availableActivityTimeSlots(createForm.activityDate, showDaytimeSlots),
    [createForm.activityDate, showDaytimeSlots],
  );
  const hasMoreActivitySlots = !showDaytimeSlots && !isWeekendActivityDate(createForm.activityDate);

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
  const createMutation = useMutation({
    mutationFn: (form: CreateActivityForm) => {
      if (!form.representativeStudentNo) {
        throw new Error('선택한 학생을 확인해 주세요.');
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
    setCreateForm((form) => {
      const participants = [...form.participantStudentNos];
      if (form.representativeStudentNo && form.representativeStudentNo !== student.studentNo) {
        participants.push(form.representativeStudentNo);
      }

      return {
        ...form,
        representativeStudentNo: student.studentNo,
        participantStudentNos: [...new Set(participants)].filter(
          (studentNo) => studentNo !== student.studentNo,
        ),
      };
    });
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
      id: 'participantCount',
      accessorFn: (request) => request.participants.length,
      header: '인원',
      enableSorting: false,
      cell: ({ row }) => (
        <ActivityParticipants
          participants={row.original.participants}
          fallback={{
            studentNo: row.original.studentNo,
            studentName: row.original.studentName,
          }}
          className="operation-activity-participants"
        />
      ),
      meta: { minWidth: 220, maxWidth: 320 },
    },
    {
      accessorKey: 'purpose',
      header: '내용',
      enableSorting: false,
      meta: { minWidth: 320, maxWidth: 560, truncate: true, mobileRole: 'title' },
    },
    {
      accessorKey: 'location',
      header: '장소',
      enableSorting: false,
      meta: { minWidth: 96, maxWidth: 130, truncate: true },
    },
    {
      accessorKey: 'startsAt',
      header: '일시',
      cell: ({ getValue }) => formatActivityDateTime(getValue<string>()),
      meta: { width: 175, align: 'center' },
    },
    {
      id: 'actions',
      header: '작업',
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions mobileTitle={`${row.original.purpose} 탐구활동서`}>
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
      meta: { width: 92, align: 'center', mobileRole: 'actions' },
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
        toolbar={
          <TableToolbar
            summary={requestsQuery.data ? `대기 ${requestsQuery.data.total}건` : '대기 탐구활동서'}
            className="operation-list-toolbar operation-review-toolbar"
            mobileSearch={
              <AdminSearchField
                className="operation-search-field"
                iconSize={15}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="학생, 장소, 내용 검색"
                aria-label="대기 탐구활동서 검색"
                onClear={() => {
                  setSearch('');
                  setPage(1);
                }}
              />
            }
            mobileActions={
              <Button
                className="operation-review-create"
                type="button"
                variant="primary"
                onClick={() => {
                  setShowDaytimeSlots(false);
                  setCreateOpen(true);
                }}
              >
                신규 작성
              </Button>
            }
          />
        }
        className="operation-review-list"
      >
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
              onPageSizeChange: (nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              },
            }}
            loading={requestsQuery.isPending}
            emptyText="대기 중인 탐구활동서가 없습니다."
            alwaysShowPagination
            caption="대기 탐구활동서"
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
            <DialogActions
              confirmLabel="반려"
              pendingLabel="처리 중"
              confirmDisabled={rejectMutation.isPending}
              onClose={() => setRejectForm({ id: 0, reason: '' })}
            />
          </form>
          {rejectMutation.isError ? <p className="form-error">반려 처리에 실패했습니다.</p> : null}
        </section>
      ) : null}

      <Drawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setShowDaytimeSlots(false);
          createMutation.reset();
        }}
        title="탐구활동서 작성"
        footer={
          <DialogActions
            onClose={() => {
              setCreateOpen(false);
              setShowDaytimeSlots(false);
            }}
            confirmLabel="작성"
            confirmType="submit"
            confirmDisabled={createMutation.isPending}
          />
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
            </header>
            <AdminSearchField
              className="activity-student-search-field"
              iconSize={15}
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="학번 또는 이름"
              aria-label="참여 학생 검색"
              onClear={() => setStudentSearch('')}
            />
            <div className="activity-student-results" role="list" aria-label="학생 검색 결과">
              {studentsQuery.isPending ? (
                <p aria-label="로딩 중">
                  <LoaderCircle
                    className="ui-status-state__icon admin-loading-spinner"
                    size={18}
                    aria-hidden="true"
                  />
                </p>
              ) : null}
              {studentsQuery.isError ? (
                <p className="form-error">학생을 불러오지 못했습니다.</p>
              ) : null}
              {!studentsQuery.isPending && filteredStudents.length === 0 ? (
                <p className="activity-student-results__empty">검색 결과가 없습니다.</p>
              ) : null}
              {filteredStudents.map((student) => (
                <div key={student.studentId} role="listitem">
                  <span>
                    {student.studentNo} {student.studentName}
                  </span>
                  <div>
                    {student.studentNo === createForm.representativeStudentNo ? (
                      <button
                        className="activity-student-result__badge is-representative"
                        type="button"
                        disabled
                        aria-label={`${student.studentName} 대표 학생`}
                      >
                        대표
                      </button>
                    ) : selectedStudentNos.has(student.studentNo) ? (
                      <button
                        className="activity-student-result__badge"
                        type="button"
                        aria-label={`${student.studentName} 참여됨`}
                        disabled
                      >
                        추가됨
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addParticipant(student)}
                        disabled={selectedStudentNos.has(student.studentNo)}
                      >
                        추가
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="activity-create-section activity-selected-students"
            aria-label="선택한 학생"
          >
            <h3 className="sr-only">선택한 학생</h3>
            {createForm.representativeStudentNo ? (
              <button
                className="activity-student-chip activity-student-chip--representative"
                type="button"
                disabled
                aria-label="대표 학생"
              >
                <span>
                  대표 · {createForm.representativeStudentNo}{' '}
                  {studentByNo.get(createForm.representativeStudentNo)?.studentName}
                </span>
              </button>
            ) : (
              <p className="sr-only">대표 학생이 선택되지 않았습니다.</p>
            )}
            {createForm.participantStudentNos.map((studentNo) => (
              <div
                className="activity-student-chip"
                key={studentNo}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const student = studentByNo.get(studentNo);
                  if (student) selectRepresentative(student);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  const student = studentByNo.get(studentNo);
                  if (student) selectRepresentative(student);
                }}
                aria-label={`${studentNo} 대표 학생으로 설정`}
              >
                <span>
                  {studentNo} {studentByNo.get(studentNo)?.studentName}
                </span>
                <button
                  type="button"
                  aria-label={`${studentNo} 참여 학생 제거`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCreateForm((form) => ({
                      ...form,
                      participantStudentNos: form.participantStudentNos.filter(
                        (value) => value !== studentNo,
                      ),
                    }));
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </section>

          <section className="activity-create-section activity-create-schedule">
            <header>
              <h3>일시</h3>
            </header>
            <div className="activity-create-form__grid">
              <label>
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
                    setShowDaytimeSlots(false);
                  }}
                  required
                />
              </label>
              <fieldset className="activity-slot-picker">
                <legend className="sr-only">면학 시간</legend>
                <div className="activity-slot-picker__controls">
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
                          <span>{slot.label.replace(/^저녁\s*/, '')}</span>
                          <small>
                            {slot.startsAt}~{slot.endsAt}
                          </small>
                        </label>
                      );
                    })}
                  </div>
                  {hasMoreActivitySlots ? (
                    <button
                      className="activity-slot-more"
                      type="button"
                      aria-expanded={showDaytimeSlots}
                      onClick={() => setShowDaytimeSlots(true)}
                    >
                      더보기
                    </button>
                  ) : null}
                </div>
              </fieldset>
            </div>
          </section>
          <section className="activity-create-section activity-create-details">
            <header>
              <h3>활동 내용</h3>
            </header>
            <div className="activity-create-form__grid activity-create-form__grid--details">
              <label>
                <input
                  value={createForm.location}
                  onChange={(event) =>
                    setCreateForm((form) => ({ ...form, location: event.target.value }))
                  }
                  maxLength={160}
                  placeholder="활동 장소를 입력해 주세요."
                  required
                />
              </label>
              <label>
                <textarea
                  value={createForm.purpose}
                  onChange={(event) =>
                    setCreateForm((form) => ({ ...form, purpose: event.target.value }))
                  }
                  maxLength={500}
                  placeholder="활동 내용을 입력해 주세요."
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
    </div>
  );
}
