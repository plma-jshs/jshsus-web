import type {
  ActivityRequestStatus,
  ActivityRequestStudentOption,
  ActivityRequestSummary,
} from '@jshsus/types';

export type ActivityRequestFilter = 'all' | 'submitted' | 'approved' | 'rejected' | 'finished';
export type ActivityRequestSearchField = 'activity_location' | 'activity' | 'location';

export const activityStatusLabels: Record<ActivityRequestStatus, string> = {
  draft: '임시저장',
  submitted: '승인 대기',
  approved: '승인',
  rejected: '반려',
  canceled: '취소',
  completed: '완료',
};

export function matchesActivityFilter(
  request: ActivityRequestSummary,
  filter: ActivityRequestFilter,
) {
  if (filter === 'all') return true;
  if (filter === 'finished') return request.status === 'completed' || request.status === 'canceled';
  return request.status === filter;
}

export function matchesActivityQuery(
  request: ActivityRequestSummary,
  query: string,
  field: ActivityRequestSearchField = 'activity_location',
) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  if (!normalized) return true;
  const values = {
    activity_location: `${request.purpose} ${request.location}`,
    activity: request.purpose,
    location: request.location,
  };
  return values[field].toLocaleLowerCase('ko-KR').includes(normalized);
}

export function formatActivityParticipants(
  participants: ActivityRequestSummary['participants'],
  fallback: Pick<ActivityRequestSummary, 'studentName' | 'studentNo'>,
) {
  const students = participants?.length
    ? participants
    : [
        {
          isRepresentative: true,
          studentId: fallback.studentNo,
          studentName: fallback.studentName,
          studentNo: fallback.studentNo,
        },
      ];
  return students
    .map(
      (student) =>
        `${student.studentNo}${student.studentName}${student.isRepresentative ? '(대표)' : ''}`,
    )
    .join(', ');
}

export function searchActivityRequestStudents(
  students: ActivityRequestStudentOption[],
  query: string,
  limit = 30,
) {
  const keyword = query.trim().toLocaleLowerCase('ko-KR');
  if (!keyword) return [];

  const rank = (student: ActivityRequestStudentOption) => {
    const studentNo = String(student.studentNo);
    const name = student.studentName.toLocaleLowerCase('ko-KR');
    if (studentNo === keyword) return 0;
    if (studentNo.startsWith(keyword)) return 1;
    if (name.startsWith(keyword)) return 2;
    if (studentNo.includes(keyword)) return 3;
    if (name.includes(keyword)) return 4;
    return Number.POSITIVE_INFINITY;
  };

  return students
    .map((student) => ({ student, rank: rank(student) }))
    .filter(({ rank: score }) => Number.isFinite(score))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.student.studentNo - right.student.studentNo ||
        left.student.studentName.localeCompare(right.student.studentName, 'ko-KR'),
    )
    .slice(0, limit)
    .map(({ student }) => student);
}

export type ActivityRequestForm = {
  advisorTeacherId: number | null;
  location: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
};

export type ActivityRequestFormErrors = Partial<Record<keyof ActivityRequestForm, string>>;

export function validateActivityRequestForm(form: ActivityRequestForm) {
  const errors: ActivityRequestFormErrors = {};
  const location = form.location.trim();
  const purpose = form.purpose.trim();
  const startsAt = form.startsAt ? new Date(form.startsAt).getTime() : Number.NaN;
  const endsAt = form.endsAt ? new Date(form.endsAt).getTime() : Number.NaN;

  if (!form.advisorTeacherId) errors.advisorTeacherId = '담당 교사를 선택해 주세요.';

  if (!location) errors.location = '활동 장소를 입력해 주세요.';
  else if (location.length > 160) errors.location = '활동 장소는 160자 이내로 입력해 주세요.';

  if (!form.startsAt || !Number.isFinite(startsAt)) errors.startsAt = '시작 일시를 선택해 주세요.';
  if (!form.endsAt || !Number.isFinite(endsAt)) errors.endsAt = '종료 일시를 선택해 주세요.';
  else if (Number.isFinite(startsAt) && endsAt <= startsAt) {
    errors.endsAt = '종료 일시는 시작 일시보다 늦어야 합니다.';
  }

  if (!purpose) errors.purpose = '활동 목적을 입력해 주세요.';
  else if (purpose.length > 500) errors.purpose = '활동 목적은 500자 이내로 입력해 주세요.';

  return errors;
}

export function getActivityDurationLabel(startsAt: string, endsAt: string) {
  const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const totalMinutes = Math.round(duration / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}
