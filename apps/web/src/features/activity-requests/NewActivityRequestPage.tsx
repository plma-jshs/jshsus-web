import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Send, X } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { getSession } from '../auth/api';
import {
  createActivityRequest,
  getActivityRequestStudentOptions,
  getActivityRequestTeacherOptions,
} from './api';
import {
  activitySlotsDateTimes,
  availableActivityTimeSlots,
  koreaDateInput,
  type ActivityTimeSlotId,
} from './activitySchedule';
import {
  type ActivityRequestForm,
  searchActivityRequestStudents,
  validateActivityRequestForm,
} from './presentation';
import '../../styles/activity-requests.css';

function initialForm(): ActivityRequestForm {
  const date = koreaDateInput();
  const [slot] = availableActivityTimeSlots(date);
  const times = activitySlotsDateTimes(date, [slot?.id ?? 'evening-1']);
  return {
    advisorTeacherId: null,
    location: '',
    startsAt: times?.startsAt ?? '',
    endsAt: times?.endsAt ?? '',
    purpose: '',
  };
}

export function NewActivityRequestPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState<ActivityRequestForm>(initialForm);
  const [activityDate, setActivityDate] = useState(() => koreaDateInput());
  const [activitySlotIds, setActivitySlotIds] = useState<ActivityTimeSlotId[]>(() => {
    const [slot] = availableActivityTimeSlots(koreaDateInput());
    return [slot?.id ?? 'evening-1'];
  });
  const [touched, setTouched] = useState<Partial<Record<keyof ActivityRequestForm, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [participantStudentNos, setParticipantStudentNos] = useState<number[]>([]);
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
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
  const studentByNo = useMemo(
    () => new Map((studentsQuery.data ?? []).map((student) => [student.studentNo, student])),
    [studentsQuery.data],
  );
  const filteredStudents = useMemo(
    () => searchActivityRequestStudents(studentsQuery.data ?? [], studentSearch),
    [studentSearch, studentsQuery.data],
  );
  const errors = useMemo(() => validateActivityRequestForm(form), [form]);
  const availableSlots = useMemo(() => availableActivityTimeSlots(activityDate), [activityDate]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!form.advisorTeacherId) throw new Error('담당 교사를 선택해 주세요.');
      return createActivityRequest({
        ...form,
        advisorTeacherId: form.advisorTeacherId,
        participantStudentNos,
        activitySlotIds,
        location: form.location.trim(),
        purpose: form.purpose.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activity-requests', 'me'] });
      window.alert('탐구활동서가 제출되었습니다.');
      void navigate({ to: '/activity-requests' });
    },
    onError: (error) =>
      showToast({
        title: '탐구활동서를 제출하지 못했습니다.',
        description: error.message,
        tone: 'danger',
      }),
  });

  const updateField = <K extends keyof ActivityRequestForm>(
    field: K,
    value: ActivityRequestForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (mutation.isError) mutation.reset();
  };
  const showError = (field: keyof ActivityRequestForm) =>
    Boolean(errors[field]) && (attempted || touched[field]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    mutation.mutate();
  };
  const applySchedule = (date: string, slotIds: ActivityTimeSlotId[]) => {
    const times = activitySlotsDateTimes(date, slotIds);
    setActivityDate(date);
    setActivitySlotIds(slotIds);
    setForm((current) => ({
      ...current,
      startsAt: times?.startsAt ?? '',
      endsAt: times?.endsAt ?? '',
    }));
    if (mutation.isError) mutation.reset();
  };
  const toggleActivitySlot = (slotId: ActivityTimeSlotId) => {
    const next = activitySlotIds.includes(slotId)
      ? activitySlotIds.filter((id) => id !== slotId)
      : [...activitySlotIds, slotId];
    if (next.length) applySchedule(activityDate, next);
  };

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('activityRequests', '신청')}
      title="탐구활동서 신청"
      width="reading"
      variant="form"
    >
      <form className="activity-form" onSubmit={submit} noValidate>
        <section className="activity-form-section" aria-labelledby="activity-purpose-title">
          <div className="activity-form-section__heading">
            <span>1</span>
            <div>
              <h2 id="activity-purpose-title">활동 정보</h2>
              {/* <p>활동 내용을 작성해 주세요.</p> */}
            </div>
          </div>
          <div className="activity-form-field">
            <label htmlFor="activity-purpose">활동 목적</label>
            <textarea
              id="activity-purpose"
              value={form.purpose}
              onChange={(event) => updateField('purpose', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, purpose: true }))}
              maxLength={500}
              rows={7}
              placeholder="예: 물리 탐구 보고서 작성을 위해 실험 장비를 사용하려고 합니다."
              aria-invalid={showError('purpose')}
              aria-describedby={showError('purpose') ? 'activity-purpose-error' : undefined}
              autoFocus
            />
            <div className="activity-form-field__meta">
              {showError('purpose') ? (
                <span className="activity-form-field__error" id="activity-purpose-error">
                  {errors.purpose}
                </span>
              ) : (
                <span>활동 목적을 입력해 주세요.</span>
              )}
              <span>{form.purpose.length} / 500</span>
            </div>
          </div>
        </section>

        <section className="activity-form-section" aria-labelledby="activity-participant-title">
          <div className="activity-form-section__heading">
            <span>2</span>
            <div>
              <h2 id="activity-participant-title">참여 학생</h2>
              {/* <p>신청자는 대표 학생으로 자동 포함됩니다. 함께 활동하는 학생을 추가해 주세요.</p> */}
            </div>
          </div>
          <div className="activity-participant-picker">
            <div className="activity-form-field">
              <label htmlFor="activity-participant-search">학생 검색</label>
              <input
                id="activity-participant-search"
                type="search"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="학번 또는 이름을 입력하세요"
                autoComplete="off"
              />
            </div>
            {studentSearch.trim() ? (
              <div className="activity-participant-results" aria-label="학생 검색 결과">
                {studentsQuery.isPending ? <p>학생을 불러오는 중입니다.</p> : null}
                {studentsQuery.isError ? (
                  <p className="activity-form-field__error">학생 목록을 불러오지 못했습니다.</p>
                ) : null}
                {!studentsQuery.isPending && !studentsQuery.isError && !filteredStudents.length ? (
                  <p>검색 결과가 없습니다.</p>
                ) : null}
                {filteredStudents.map((student) => {
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
                })}
              </div>
            ) : null}
          </div>
          <div className="activity-participant-selection" aria-live="polite">
            <strong>참여 학생 {participantStudentNos.length + 1}명</strong>
            <div>
              <span className="activity-participant-chip is-representative">
                {sessionQuery.data?.isLogined
                  ? `${sessionQuery.data.stuid ?? sessionQuery.data.identifier ?? ''} ${sessionQuery.data.name ?? '신청자'}`.trim()
                  : '신청자'}{' '}
                · 대표
              </span>
              {participantStudentNos.map((studentNo) => (
                <span className="activity-participant-chip" key={studentNo}>
                  {studentNo} {studentByNo.get(studentNo)?.studentName}
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
              ))}
            </div>
          </div>
        </section>

        <section className="activity-form-section" aria-labelledby="activity-schedule-title">
          <div className="activity-form-section__heading">
            <span>3</span>
            <div>
              <h2 id="activity-schedule-title">시간 / 장소</h2>
              {/* <p>이동 시간을 포함해 실제 활동이 이루어지는 기간을 선택해 주세요.</p> */}
            </div>
          </div>
          <div className="activity-form-field">
            <label htmlFor="activity-location">활동 장소</label>
            <input
              id="activity-location"
              value={form.location}
              onChange={(event) => updateField('location', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, location: true }))}
              maxLength={160}
              placeholder="예: 물리 실험실"
              aria-invalid={showError('location')}
              aria-describedby={showError('location') ? 'activity-location-error' : undefined}
            />
            {showError('location') ? (
              <span className="activity-form-field__error" id="activity-location-error">
                {errors.location}
              </span>
            ) : null}
          </div>
          <div className="activity-form-field">
            <label htmlFor="activity-advisor">담당 교사</label>
            <select
              id="activity-advisor"
              value={form.advisorTeacherId ?? ''}
              onChange={(event) =>
                updateField(
                  'advisorTeacherId',
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              onBlur={() => setTouched((current) => ({ ...current, advisorTeacherId: true }))}
              aria-invalid={showError('advisorTeacherId')}
              aria-describedby={
                showError('advisorTeacherId') ? 'activity-advisor-error' : undefined
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
            {showError('advisorTeacherId') ? (
              <span className="activity-form-field__error" id="activity-advisor-error">
                {errors.advisorTeacherId}
              </span>
            ) : null}
            {teachersQuery.isError ? (
              <span className="activity-form-field__error">
                담당 교사 목록을 불러오지 못했습니다.
              </span>
            ) : null}
          </div>
          <div className="activity-form-time-grid">
            <div className="activity-form-field">
              <label htmlFor="activity-date">활동 날짜</label>
              <input
                id="activity-date"
                type="date"
                value={activityDate}
                min={koreaDateInput()}
                onChange={(event) => {
                  const nextSlots = availableActivityTimeSlots(event.target.value);
                  const nextIds = activitySlotIds.filter((id) =>
                    nextSlots.some((slot) => slot.id === id),
                  );
                  applySchedule(
                    event.target.value,
                    nextIds.length ? nextIds : [nextSlots[0]?.id ?? 'evening-1'],
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

        <p className="activity-form-notice">
          제출 즉시 담당 교사의 검토가 시작됩니다. 제출 전 활동 장소와 시간을 다시 확인해 주세요.
        </p>

        {mutation.isError ? (
          <div className="activity-form-error" role="alert">
            <strong>신청서를 제출하지 못했습니다.</strong>
            <span>입력 내용과 로그인 상태를 확인한 뒤 다시 시도해 주세요.</span>
          </div>
        ) : null}

        <div className="activity-form-actions">
          <Link className="detail-secondary-button" to="/activity-requests">
            <ArrowLeft size={16} aria-hidden="true" /> 취소
          </Link>
          <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
            <Send size={16} aria-hidden="true" />
            {mutation.isPending ? '제출 중' : '제출'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
