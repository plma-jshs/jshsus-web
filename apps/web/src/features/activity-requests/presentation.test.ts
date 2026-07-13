import type { ActivityRequestSummary } from '@jshsus/types';
import { describe, expect, it } from 'vitest';
import {
  getActivityDurationLabel,
  matchesActivityFilter,
  matchesActivityQuery,
  validateActivityRequestForm,
} from './presentation';

const request: ActivityRequestSummary = {
  id: 4,
  studentNo: 260101,
  studentName: '테스트 학생',
  teacherName: '담당 교사',
  location: '물리 실험실',
  startsAt: '2026-07-13T18:00:00+09:00',
  endsAt: '2026-07-13T19:30:00+09:00',
  purpose: '간섭무늬 탐구 실험 진행',
  status: 'completed',
  issuedNumber: 'AR-20260713-0004',
};

describe('activity request presentation', () => {
  it('groups completed and canceled requests in the finished filter', () => {
    expect(matchesActivityFilter(request, 'finished')).toBe(true);
    expect(matchesActivityFilter({ ...request, status: 'canceled' }, 'finished')).toBe(true);
    expect(matchesActivityFilter({ ...request, status: 'approved' }, 'finished')).toBe(false);
  });

  it('searches purpose, location, teacher, and issue number', () => {
    expect(matchesActivityQuery(request, '간섭무늬')).toBe(true);
    expect(matchesActivityQuery(request, '물리 실험실')).toBe(true);
    expect(matchesActivityQuery(request, '0004')).toBe(true);
    expect(matchesActivityQuery(request, '화학')).toBe(false);
  });

  it('validates the time range and required descriptive fields', () => {
    expect(
      validateActivityRequestForm({
        location: '',
        purpose: '짧음',
        startsAt: '2026-07-13T19:00',
        endsAt: '2026-07-13T18:00',
      }),
    ).toEqual({
      location: '활동 장소를 입력해 주세요.',
      purpose: '활동 목적을 10자 이상 구체적으로 작성해 주세요.',
      endsAt: '종료 일시는 시작 일시보다 늦어야 합니다.',
    });
  });

  it('formats a compact duration label', () => {
    expect(getActivityDurationLabel(request.startsAt, request.endsAt)).toBe('1시간 30분');
  });
});
