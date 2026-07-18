import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Save, X } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { parsePositiveRouteId } from '../../shared/lib/route';
import { getSession } from '../auth/api';
import {
  getActivityRequest,
  getActivityRequestStudentOptions,
  getActivityRequestTeacherOptions,
  updateActivityRequest,
  type EditableActivityRequestDetail,
} from './api';
import {
  activitySlotsDateTimes,
  availableActivityTimeSlots,
  inferActivityTimeSlotIds,
  koreaDateInput,
  type ActivityTimeSlotId,
} from './activitySchedule';
import {
  searchActivityRequestStudents,
  validateActivityRequestForm,
  type ActivityRequestForm,
} from './presentation';
import '../../styles/activity-requests.css';

function EditForm({ request }: { request: EditableActivityRequestDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const studentsQuery = useQuery({
    queryKey: ['activity-request-student-options'],
    queryFn: getActivityRequestStudentOptions,
    staleTime: 5 * 60 * 1000,
  });
  const teachersQuery = useQuery({
    queryKey: ['activity-request-teacher-options'],
    queryFn: getActivityRequestTeacherOptions,
    staleTime: 5 * 60 * 1000,
  });
  const initialDate = koreaDateInput(new Date(request.startsAt));
  const inferredSlotIds = inferActivityTimeSlotIds(
    initialDate,
    request.startsAt,
    request.endsAt,
    request.activitySlotIds,
  );
  const initialSlotIds = inferredSlotIds.length
    ? inferredSlotIds
    : [availableActivityTimeSlots(initialDate)[0]?.id ?? 'evening-1'];
  const [form, setForm] = useState<ActivityRequestForm>(() => ({
    advisorTeacherId: request.advisorTeacherId ?? null,
    location: request.location,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    purpose: request.purpose,
  }));
  const [activityDate, setActivityDate] = useState(initialDate);
  const [activitySlotIds, setActivitySlotIds] = useState<ActivityTimeSlotId[]>(initialSlotIds);
  const [participantStudentNos, setParticipantStudentNos] = useState<number[]>(() =>
    request.participants
      .filter((student) => !student.isRepresentative)
      .map((student) => student.studentNo),
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [attempted, setAttempted] = useState(false);
  const errors = useMemo(() => validateActivityRequestForm(form), [form]);
  const studentByNo = useMemo(
    () => new Map((studentsQuery.data ?? []).map((student) => [student.studentNo, student])),
    [studentsQuery.data],
  );
  const filteredStudents = useMemo(
    () => searchActivityRequestStudents(studentsQuery.data ?? [], studentSearch),
    [studentSearch, studentsQuery.data],
  );
  const availableSlots = useMemo(() => availableActivityTimeSlots(activityDate), [activityDate]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!form.advisorTeacherId) throw new Error('담당 교사를 선택해 주세요.');
      return updateActivityRequest(request.id, {
        participantStudentNos,
        activitySlotIds,
        advisorTeacherId: form.advisorTeacherId,
        location: form.location.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        purpose: form.purpose.trim(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-requests', 'me'] }),
        queryClient.invalidateQueries({
          queryKey: ['activity-requests', 'detail', request.id],
        }),
      ]);
      await navigate({
        to: '/activity-requests/$requestId',
        params: { requestId: String(request.id) },
      });
      showToast({ title: '탐구활동서를 수정했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '탐구활동서를 수정하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      }),
  });

  const applySchedule = (date: string, slotIds: ActivityTimeSlotId[]) => {
    const times = activitySlotsDateTimes(date, slotIds);
    setActivityDate(date);
    setActivitySlotIds(slotIds);
    setForm((current) => ({
      ...current,
      startsAt: times?.startsAt ?? '',
      endsAt: times?.endsAt ?? '',
    }));
  };
  const toggleActivitySlot = (slotId: ActivityTimeSlotId) => {
    const next = activitySlotIds.includes(slotId)
      ? activitySlotIds.filter((id) => id !== slotId)
      : [...activitySlotIds, slotId];
    if (next.length) applySchedule(activityDate, next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!Object.keys(errors).length) mutation.mutate();
  };

  return (
    <form className="activity-form" onSubmit={submit} noValidate>
      <section className="activity-form-section" aria-labelledby="activity-edit-purpose-title">
        <div className="activity-form-section__heading">
          <span>1</span>
          <div>
            <h2 id="activity-edit-purpose-title">활동 정보</h2>
            <p>승인 전까지 목적, 장소, 일정과 담당 교사를 수정할 수 있습니다.</p>
          </div>
        </div>
        <div className="activity-form-field">
          <label htmlFor="activity-edit-purpose">활동 목적</label>
          <textarea
            id="activity-edit-purpose"
            value={form.purpose}
            onChange={(event) =>
              setForm((current) => ({ ...current, purpose: event.target.value }))
            }
            maxLength={500}
            rows={6}
            aria-invalid={attempted && Boolean(errors.purpose)}
          />
          {attempted && errors.purpose ? (
            <span className="activity-form-field__error">{errors.purpose}</span>
          ) : null}
        </div>
      </section>

      <section className="activity-form-section" aria-labelledby="activity-edit-students-title">
        <div className="activity-form-section__heading">
          <span>2</span>
          <div>
            <h2 id="activity-edit-students-title">참여 학생</h2>
            <p>대표 학생은 유지되며 함께 활동할 학생을 다시 구성할 수 있습니다.</p>
          </div>
        </div>
        <div className="activity-participant-picker">
          <div className="activity-form-field">
            <label htmlFor="activity-edit-student-search">학생 검색</label>
            <input
              id="activity-edit-student-search"
              type="search"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="학번 또는 이름"
              autoComplete="off"
            />
          </div>
          {studentSearch.trim() ? (
            <div className="activity-participant-results" aria-label="학생 검색 결과">
              {filteredStudents.length ? (
                filteredStudents.map((student) => {
                  const selected = participantStudentNos.includes(student.studentNo);
                  return (
                    <button
                      key={student.studentId}
                      type="button"
                      disabled={selected || participantStudentNos.length >= 29}
                      onClick={() => {
                        setParticipantStudentNos((current) => [...current, student.studentNo]);
                        setStudentSearch('');
                      }}
                    >
                      <span>
                        <strong>{student.studentNo}</strong> {student.studentName}
                      </span>
                      <span>{selected ? '추가됨' : '추가'}</span>
                    </button>
                  );
                })
              ) : (
                <p>검색 결과가 없습니다.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="activity-participant-selection" aria-live="polite">
          <strong>참여 학생 {participantStudentNos.length + 1}명</strong>
          <div>
            <span className="activity-participant-chip is-representative">
              {request.studentNo} {request.studentName} · 대표
            </span>
            {participantStudentNos.map((studentNo) => {
              const existing = request.participants.find(
                (student) => student.studentNo === studentNo,
              );
              return (
                <span className="activity-participant-chip" key={studentNo}>
                  {studentNo}{' '}
                  {studentByNo.get(studentNo)?.studentName ?? existing?.studentName ?? ''}
                  <button
                    type="button"
                    aria-label={`${studentNo} 참여 학생 제거`}
                    onClick={() =>
                      setParticipantStudentNos((current) =>
                        current.filter((value) => value !== studentNo),
                      )
                    }
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="activity-form-section" aria-labelledby="activity-edit-schedule-title">
        <div className="activity-form-section__heading">
          <span>3</span>
          <div>
            <h2 id="activity-edit-schedule-title">시간과 장소</h2>
            <p>대기 중인 신청은 기존 활동일이 지나도 새 일정으로 수정할 수 있습니다.</p>
          </div>
        </div>
        <div className="activity-form-field">
          <label htmlFor="activity-edit-location">활동 장소</label>
          <input
            id="activity-edit-location"
            value={form.location}
            onChange={(event) =>
              setForm((current) => ({ ...current, location: event.target.value }))
            }
            maxLength={160}
            aria-invalid={attempted && Boolean(errors.location)}
          />
          {attempted && errors.location ? (
            <span className="activity-form-field__error">{errors.location}</span>
          ) : null}
        </div>
        <div className="activity-form-field">
          <label htmlFor="activity-edit-advisor">담당 교사</label>
          <select
            id="activity-edit-advisor"
            value={form.advisorTeacherId ?? ''}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                advisorTeacherId: event.target.value ? Number(event.target.value) : null,
              }))
            }
            required
          >
            <option value="">담당 교사를 선택하세요</option>
            {(teachersQuery.data ?? []).map((teacher) => (
              <option key={teacher.userId} value={teacher.userId}>
                {teacher.staffNo} {teacher.name}
              </option>
            ))}
          </select>
          {attempted && errors.advisorTeacherId ? (
            <span className="activity-form-field__error">{errors.advisorTeacherId}</span>
          ) : null}
        </div>
        <div className="activity-form-time-grid">
          <div className="activity-form-field">
            <label htmlFor="activity-edit-date">활동 날짜</label>
            <input
              id="activity-edit-date"
              type="date"
              value={activityDate}
              onChange={(event) => {
                const slots = availableActivityTimeSlots(event.target.value);
                const nextIds = activitySlotIds.filter((id) =>
                  slots.some((slot) => slot.id === id),
                );
                applySchedule(
                  event.target.value,
                  nextIds.length ? nextIds : [slots[0]?.id ?? 'evening-1'],
                );
              }}
              required
            />
          </div>
          <fieldset className="activity-slot-selector">
            <legend>활동 시간</legend>
            <div className="activity-slot-options">
              {availableSlots.map((slot) => {
                const checked = activitySlotIds.includes(slot.id);
                return (
                  <label className={checked ? 'is-selected' : undefined} key={slot.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleActivitySlot(slot.id)}
                    />
                    <span>
                      <strong>{slot.label}</strong>
                      <small>
                        {slot.startsAt}~{slot.endsAt}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      {mutation.isError ? (
        <div className="activity-form-error" role="alert">
          <strong>신청 내용을 저장하지 못했습니다.</strong>
          <span>승인 상태와 입력 내용을 확인한 뒤 다시 시도해 주세요.</span>
        </div>
      ) : null}

      <div className="activity-form-actions">
        <Link
          className="detail-secondary-button"
          to="/activity-requests/$requestId"
          params={{ requestId: String(request.id) }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> 취소
        </Link>
        <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
          <Save size={16} aria-hidden="true" />
          {mutation.isPending ? '저장 중' : '수정 내용 저장'}
        </button>
      </div>
    </form>
  );
}

export function EditActivityRequestPage() {
  const { requestId } = useParams({ from: '/activity-requests/$requestId/edit' });
  const id = parsePositiveRouteId(requestId);
  const requestQuery = useQuery({
    queryKey: ['activity-requests', 'detail', id ?? 0],
    queryFn: () => getActivityRequest(id ?? 0),
    enabled: id !== null,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const canEdit =
    requestQuery.data !== undefined &&
    sessionQuery.data?.isLogined === true &&
    Number(sessionQuery.data.stuid ?? sessionQuery.data.identifier) === requestQuery.data.studentNo;

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('activityRequests', '수정')}
      title="탐구활동서 수정"
      description="승인 대기 중인 신청 내용을 수정합니다."
      width="reading"
      variant="form"
    >
      {requestQuery.isLoading || sessionQuery.isLoading ? (
        <PageState kind="loading" variant="page" title="신청 내용을 불러오는 중입니다." />
      ) : null}
      {!requestQuery.isLoading &&
      !sessionQuery.isLoading &&
      (requestQuery.isError || !requestQuery.data || id === null) ? (
        <PageState
          kind="error"
          variant="page"
          title="수정할 신청을 불러오지 못했습니다."
          action={
            <Link className="detail-secondary-button" to="/activity-requests">
              신청 목록으로
            </Link>
          }
        />
      ) : null}
      {requestQuery.data && requestQuery.data.status !== 'submitted' ? (
        <PageState
          kind="empty"
          variant="page"
          title="승인 대기 중인 신청만 수정할 수 있습니다."
          action={
            <Link
              className="detail-secondary-button"
              to="/activity-requests/$requestId"
              params={{ requestId }}
            >
              신청 내용 보기
            </Link>
          }
        />
      ) : null}
      {requestQuery.data?.status === 'submitted' && !sessionQuery.isLoading && !canEdit ? (
        <PageState
          kind="error"
          variant="page"
          title="대표 학생만 신청 내용을 수정할 수 있습니다."
          action={
            <Link
              className="detail-secondary-button"
              to="/activity-requests/$requestId"
              params={{ requestId }}
            >
              신청 내용 보기
            </Link>
          }
        />
      ) : null}
      {requestQuery.data?.status === 'submitted' && canEdit ? (
        <EditForm key={requestQuery.data.id} request={requestQuery.data} />
      ) : null}
    </PageScaffold>
  );
}
