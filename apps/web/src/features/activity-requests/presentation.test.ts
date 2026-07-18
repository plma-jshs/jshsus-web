import type { ActivityRequestSummary } from '@jshsus/types';
import { describe, expect, it } from 'vitest';
import {
  getActivityDurationLabel,
  matchesActivityFilter,
  matchesActivityQuery,
  searchActivityRequestStudents,
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
};

describe('activity request presentation', () => {
  it('groups completed and canceled requests in the finished filter', () => {
    expect(matchesActivityFilter(request, 'finished')).toBe(true);
    expect(matchesActivityFilter({ ...request, status: 'canceled' }, 'finished')).toBe(true);
    expect(matchesActivityFilter({ ...request, status: 'approved' }, 'finished')).toBe(false);
  });

  it('searches purpose, location, teacher, representative, and public id', () => {
    expect(matchesActivityQuery(request, '간섭무늬')).toBe(true);
    expect(matchesActivityQuery(request, '물리 실험실')).toBe(true);
    expect(matchesActivityQuery(request, '담당 교사')).toBe(true);
    expect(matchesActivityQuery(request, '테스트 학생')).toBe(true);
    expect(matchesActivityQuery(request, '#4')).toBe(true);
    expect(matchesActivityQuery({ ...request, issuedNumber: 'AR-20260713-0004' }, '0004')).toBe(
      false,
    );
    expect(matchesActivityQuery(request, '화학')).toBe(false);
  });

  it('ranks student-number prefixes before later substring matches', () => {
    const result = searchActivityRequestStudents(
      [
        {
          studentId: 1,
          studentNo: 1210,
          studentName: '부분 일치',
          grade: 1,
          classNo: 2,
          number: 10,
        },
        { studentId: 2, studentNo: 2103, studentName: '접두 셋', grade: 2, classNo: 1, number: 3 },
        {
          studentId: 3,
          studentNo: 2101,
          studentName: '접두 하나',
          grade: 2,
          classNo: 1,
          number: 1,
        },
      ],
      '21',
    );

    expect(result.map((student) => student.studentNo)).toEqual([2101, 2103, 1210]);
  });

  it('validates the time range and required fields', () => {
    expect(
      validateActivityRequestForm({
        advisorTeacherId: null,
        location: '',
        purpose: '',
        startsAt: '2026-07-13T19:00',
        endsAt: '2026-07-13T18:00',
      }),
    ).toEqual({
      advisorTeacherId: '담당 교사를 선택해 주세요.',
      location: '활동 장소를 입력해 주세요.',
      purpose: '활동 목적을 입력해 주세요.',
      endsAt: '종료 일시는 시작 일시보다 늦어야 합니다.',
    });
  });

  it('formats a compact duration label', () => {
    expect(getActivityDurationLabel(request.startsAt, request.endsAt)).toBe('1시간 30분');
  });
});
