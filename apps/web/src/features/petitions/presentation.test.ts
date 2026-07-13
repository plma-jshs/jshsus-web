import type { PetitionSummary } from '@jshsus/types';
import { describe, expect, it } from 'vitest';
import { getPetitionProgress, matchesPetitionFilter, matchesPetitionQuery } from './presentation';

const petition: PetitionSummary = {
  id: 1,
  title: '도서관 운영 시간 개선 제안',
  content: '시험 기간 도서관 운영 시간을 늘려 주세요.',
  authorName: '학생회',
  participantCount: 72,
  threshold: 50,
  startsAt: '2026-07-01T00:00:00+09:00',
  endsAt: '2026-07-31T23:59:59+09:00',
  status: 'answered',
};

describe('petition presentation', () => {
  it('caps progress at 100 percent', () => {
    expect(getPetitionProgress(petition)).toBe(100);
  });

  it('groups expired and hidden petitions in the closed filter', () => {
    expect(matchesPetitionFilter({ ...petition, status: 'expired' }, 'closed')).toBe(true);
    expect(matchesPetitionFilter({ ...petition, status: 'hidden' }, 'closed')).toBe(true);
    expect(matchesPetitionFilter(petition, 'closed')).toBe(false);
  });

  it('searches title, content, and author without case sensitivity', () => {
    expect(matchesPetitionQuery(petition, '도서관')).toBe(true);
    expect(matchesPetitionQuery(petition, '학생회')).toBe(true);
    expect(matchesPetitionQuery(petition, '급식')).toBe(false);
  });
});
