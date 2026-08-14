import type {
  ActivityPrintStudent,
  ActivityRequestAdminSummary,
  ActivityRequestPrintBatch,
} from '@jshsus/types';
import { formatActivityTimeRanges, koreaDateInput } from './activitySchedule';

function participantsText(request: ActivityRequestAdminSummary) {
  const participants = request.participants.length
    ? request.participants
    : [
        {
          studentNo: request.studentNo,
          studentName: request.studentName,
          isRepresentative: true,
        },
      ];
  return participants
    .map(
      (participant) =>
        `${participant.studentNo} ${participant.studentName}${participant.isRepresentative ? '(대표)' : ''}`,
    )
    .join(', ');
}

function printDateLabel(date: string) {
  const [, month, day] = date.split('-');
  return `${month ?? ''}월 ${day ?? ''}일`;
}

function StudentPrintTable({
  students,
  floor,
}: {
  students: ActivityPrintStudent[];
  floor: number;
}) {
  const groups = new Map<string, ActivityPrintStudent[]>();
  for (const student of students) {
    const key = `${student.grade}-${student.classNo}`;
    groups.set(key, [...(groups.get(key) ?? []), student]);
  }
  const periodKeys = [...new Set(students.flatMap((student) => Object.keys(student.slotLocations)))]
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
  const periods = periodKeys.length ? periodKeys : ['1', '2'];
  const genderLabel = floor === 2 ? '여자' : '남자';

  return (
    <div className="activity-print-student-grid">
      {[...groups.entries()].map(([key, group]) => (
        <table key={key} className="activity-print-student-table">
          <caption>
            {group[0]?.grade}학년 {group[0]?.classNo}반 {genderLabel}
          </caption>
          <thead>
            <tr>
              <th>학번</th>
              <th>이름</th>
              {periods.map((period) => (
                <th key={period}>{period}면학</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group
              .sort((left, right) => left.studentNo - right.studentNo)
              .map((student) => (
                <tr key={student.studentNo}>
                  <td>{student.studentNo}</td>
                  <td>{student.studentName}</td>
                  {periods.map((period) => (
                    <td key={period}>{student.slotLocations[period] ?? ''}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function ActivityPrintBatch({ batch }: { batch: ActivityRequestPrintBatch | null }) {
  if (!batch?.documents.length) return null;

  return (
    <section className="activity-print-batch" aria-hidden="true">
      <div className="activity-print-page activity-print-page--activities">
        <h1>
          {printDateLabel(batch.date)} 탐활서 명단 ({batch.floor}층)
        </h1>
        <table className="activity-print-activity-table">
          <thead>
            <tr>
              <th>활동 시간</th>
              <th>활동 장소</th>
              <th>활동 내용</th>
              <th>참여 학생</th>
              <th>지도 교사</th>
            </tr>
          </thead>
          <tbody>
            {batch.documents.map((request) => {
              const date = koreaDateInput(new Date(request.startsAt));
              return (
                <tr key={request.id}>
                  <td>
                    {formatActivityTimeRanges(
                      date,
                      request.startsAt,
                      request.endsAt,
                      request.activitySlotIds,
                    )}
                  </td>
                  <td>{request.location}</td>
                  <td>{request.purpose}</td>
                  <td>{participantsText(request)}</td>
                  <td>{request.advisorTeacherName ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="activity-print-page activity-print-page--students">
        <h2>
          {printDateLabel(batch.date)} 학생 면학 배정 ({batch.floor}층)
        </h2>
        <StudentPrintTable students={batch.students} floor={batch.floor} />
      </div>
    </section>
  );
}
