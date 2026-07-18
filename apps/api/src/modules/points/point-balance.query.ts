import * as schema from '@jshsus/db';
import { sql } from 'drizzle-orm';
import { SYSTEM_MERIT_HALF_REASON, SYSTEM_PENALTY_HALF_REASON } from './point-lifecycle.policy';

/**
 * 현재 상점 잔액에는 PLUS 원장과 상점 반감 시스템 조정만 포함한다.
 * 일반 ETC와 벌점 반감 조정은 순합계에만 반영된다.
 */
export function meritPointBalanceSql() {
  return sql<number>`coalesce(sum(case when coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type}) = 'PLUS' or coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment}) = ${SYSTEM_MERIT_HALF_REASON} then ${schema.pointRecords.point} else 0 end), 0)`.mapWith(
    Number,
  );
}

/**
 * 현재 벌점 잔액에는 MINUS 원장과 벌점 반감 시스템 조정만 포함한다.
 * DB에는 signed point로 저장하므로 화면용 크기는 abs로 반환한다.
 */
export function penaltyPointBalanceSql() {
  return sql<number>`abs(coalesce(sum(case when coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type}) = 'MINUS' or coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment}) = ${SYSTEM_PENALTY_HALF_REASON} then ${schema.pointRecords.point} else 0 end), 0))`.mapWith(
    Number,
  );
}
