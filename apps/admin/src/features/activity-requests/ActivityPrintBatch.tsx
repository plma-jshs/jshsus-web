import type { ActivityRequestAdminSummary, ActivityRequestPrintBatch } from '@jshsus/types';
import {
  formatActivityPeriodLabel,
  formatActivityTimeRanges,
  koreaDateInput,
} from './activitySchedule';

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

function ActivityPrintRow({ request }: { request: ActivityRequestAdminSummary }) {
  const date = koreaDateInput(new Date(request.startsAt));
  return (
    <tr>
      <td>
        {formatActivityPeriodLabel(date, request.startsAt, request.endsAt, request.activitySlotIds)}
        <small>
          {formatActivityTimeRanges(
            date,
            request.startsAt,
            request.endsAt,
            request.activitySlotIds,
          )}
        </small>
      </td>
      <td>{request.location}</td>
      <td>{request.purpose}</td>
      <td>{participantsText(request)}</td>
      <td>{request.advisorTeacherName ?? '-'}</td>
    </tr>
  );
}

export function ActivityPrintBatch({ batch }: { batch: ActivityRequestPrintBatch | null }) {
  if (!batch?.documents.length) return null;

  return (
    <section className="activity-print-batch" aria-hidden="true">
      <time dateTime={batch.date}>{batch.date}</time>
      <table>
        <thead>
          <tr>
            <th>시간</th>
            <th>장소</th>
            <th>내용</th>
            <th>참여 학생</th>
            <th>지도교사</th>
          </tr>
        </thead>
        <tbody>
          {batch.documents.map((request) => (
            <ActivityPrintRow key={request.id} request={request} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
