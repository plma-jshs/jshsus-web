import { describe, expect, it } from 'vitest';
import { describeAuditAction, describeAuditTarget } from './audit-log-presentation';

describe('audit log presentation', () => {
  it('translates known action codes for the administrator list', () => {
    expect(describeAuditAction('activity_request.approve')).toBe('탐구활동서 승인');
    expect(describeAuditAction('device_case.bulk-close')).toBe('보관함 전체 잠금');
  });

  it('keeps unknown implementation codes out of the primary list label', () => {
    expect(describeAuditAction('future.internal.action')).toBe('관리 작업');
  });

  it('describes a target without exposing storage naming in the primary list', () => {
    expect(describeAuditTarget('point_records', '42')).toBe('상벌점 기록 #42');
    expect(describeAuditTarget(null, null)).toBe('대상 없음');
  });
});
