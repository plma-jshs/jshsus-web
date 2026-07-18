import type { StudentSelfStatus } from '@jshsus/types';

export function PointsSummary({ points }: { points: StudentSelfStatus['points'] }) {
  return (
    <div className="status-summary" aria-label="상벌점 요약">
      <article className="is-positive">
        <span>상점</span>
        <strong>+{points.meritPoint}</strong>
      </article>
      <article className="is-negative">
        <span>벌점</span>
        <strong>{points.penaltyPoint ? `-${points.penaltyPoint}` : '0'}</strong>
      </article>
      <article className="is-total">
        <span>합계</span>
        <strong>
          {points.currentPoint > 0 ? '+' : ''}
          {points.currentPoint}
        </strong>
      </article>
    </div>
  );
}
