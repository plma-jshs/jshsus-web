import type { PetitionSummary } from '@jshsus/types';

export type PetitionFilter = 'all' | 'open' | 'awaiting_answer' | 'answered';
export type PetitionSearchField = 'title_content' | 'title' | 'author';

export const petitionStatusLabels: Record<PetitionSummary['status'], string> = {
  open: '진행 중',
  awaiting_answer: '답변 대기',
  answered: '답변 완료',
  expired: '종료',
  hidden: '숨김',
};

export function getPetitionProgress(
  petition: Pick<PetitionSummary, 'participantCount' | 'threshold'>,
) {
  if (petition.threshold <= 0) return 100;
  return Math.min(100, Math.round((petition.participantCount / petition.threshold) * 100));
}

export function matchesPetitionFilter(petition: PetitionSummary, filter: PetitionFilter) {
  if (filter === 'all') return true;
  return petition.status === filter;
}

export function matchesPetitionQuery(
  petition: PetitionSummary,
  query: string,
  field: PetitionSearchField = 'title_content',
) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  if (!normalized) return true;
  const target =
    field === 'title'
      ? petition.title
      : field === 'author'
        ? (petition.authorName ?? '')
        : `${petition.title} ${petition.content}`;
  return target.toLocaleLowerCase('ko-KR').includes(normalized);
}
