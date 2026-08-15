import type {
  ActivityPrintStudent,
  ActivityRequestAdminSummary,
  ActivityRequestPrintBatch,
  ActivityRequestPrintSection,
} from '@jshsus/types';
import type { ReactNode } from 'react';
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

function studentGroupLabel(student: ActivityPrintStudent, floor: number) {
  const genderLabel = floor === 2 ? '여자' : '남자';
  return `${student.grade}학년 ${student.classNo}반 ${genderLabel}`;
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
    groups.set(
      key,
      [...(groups.get(key) ?? []), student].sort((left, right) => left.studentNo - right.studentNo),
    );
  }
  const periodKeys = [...new Set(students.flatMap((student) => Object.keys(student.slotLocations)))]
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
  const periods = periodKeys.length ? periodKeys : ['1', '2'];
  const entries = [...groups.entries()];
  const locationKey = (location: string) => location.replace(/\s+/g, '');

  const renderLocations = (student: ActivityPrintStudent) => {
    const cells: ReactNode[] = [];
    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index]!;
      const nextPeriod = periods[index + 1];
      const location = student.slotLocations[period] ?? '';
      const nextLocation = nextPeriod ? (student.slotLocations[nextPeriod] ?? '') : '';
      if (
        period === '1' &&
        nextPeriod === '2' &&
        location &&
        nextLocation &&
        locationKey(location) === locationKey(nextLocation)
      ) {
        cells.push(
          <td key={`${period}-${nextPeriod}`} colSpan={2}>
            {location}
          </td>,
        );
        index += 1;
      } else {
        cells.push(<td key={period}>{location}</td>);
      }
    }
    return cells;
  };

  return (
    <div className="activity-print-student-grid">
      {Array.from({ length: Math.ceil(entries.length / 4) }, (_, rowIndex) => {
        const rowEntries = entries.slice(rowIndex * 4, rowIndex * 4 + 4);
        const maxRows = Math.max(...rowEntries.map(([, group]) => group.length), 0);
        return rowEntries.map(([key, group]) => (
          <table key={key} className="activity-print-student-table">
            <caption>{studentGroupLabel(group[0]!, floor)}</caption>
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
              {group.map((student) => (
                <tr key={student.studentNo}>
                  <td className="activity-print-student-number">{student.studentNo}</td>
                  <td
                    className={`activity-print-student-name${
                      student.studentName.length >= 4 ? ' is-long' : ''
                    }`}
                  >
                    {student.studentName}
                  </td>
                  {renderLocations(student)}
                </tr>
              ))}
              {Array.from({ length: maxRows - group.length }, (_, index) => (
                <tr aria-hidden="true" className="is-empty" key={`empty-${index}`}>
                  <td />
                  <td />
                  {periods.map((period) => (
                    <td key={period} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ));
      })}
    </div>
  );
}

export function ActivityPrintBatch({
  batch,
  preview = false,
}: {
  batch: ActivityRequestPrintBatch | null;
  preview?: boolean;
}) {
  if (!batch) return null;

  const fallbackSection: ActivityRequestPrintSection = {
    floor: batch.floor as Exclude<ActivityRequestPrintSection['floor'], 'all'>,
    documents: batch.documents,
    students: batch.students,
  };
  const sections: ActivityRequestPrintSection[] =
    batch.floor === 'all'
      ? [2, 3, 4]
          .map((floor) => batch.sections?.find((section) => section.floor === floor))
          .filter((section): section is ActivityRequestPrintSection => Boolean(section))
      : batch.sections?.length
        ? batch.sections
        : [fallbackSection];

  return (
    <section
      className={`activity-print-batch${preview ? ' activity-print-batch--preview' : ''}`}
      aria-hidden={preview ? undefined : true}
    >
      {sections.flatMap((section) => [
        <div
          className="activity-print-page activity-print-page--activities"
          key={`${section.floor}-activities`}
        >
          <h1>
            {printDateLabel(batch.date)} 탐활서 명단 ({section.floor}층)
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
              {section.documents.map((request) => {
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
        </div>,
        <div
          className="activity-print-page activity-print-page--students"
          key={`${section.floor}-students`}
        >
          <StudentPrintTable students={section.students} floor={section.floor} />
        </div>,
      ])}
    </section>
  );
}
