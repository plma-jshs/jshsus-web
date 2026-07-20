import type { StudentSelfStatus } from '@jshsus/types';

function signedPoint(value: number, positivePrefix = true) {
  if (value === 0) return '0';
  const absolute = Math.abs(value);
  if (value > 0) return positivePrefix ? `+${absolute}` : String(absolute);
  return `-${absolute}`;
}

export function PointsSummary({ points }: { points: StudentSelfStatus['points'] }) {
  return (
    <div className="status-summary" aria-label="상벌점 요약">
      <article className="is-positive">
        <span>상점</span>
        <strong>{signedPoint(Math.abs(points.meritPoint))}</strong>
      </article>
      <article className="is-negative">
        <span>벌점</span>
        <strong>{signedPoint(-Math.abs(points.penaltyPoint))}</strong>
      </article>
      <article className="is-total">
        <span>합계</span>
        <strong>{signedPoint(points.currentPoint)}</strong>
      </article>
    </div>
  );
}
