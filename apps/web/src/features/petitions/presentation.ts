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

export function formatPetitionDate(value: string | Date, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return sameYear ? `${month}.${day}` : `${date.getFullYear()}.${month}.${day}`;
}

export function petitionDaysRemaining(value: string | Date, now = new Date()) {
  const end = value instanceof Date ? value : new Date(value);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.ceil((endDay - today) / 86_400_000);
}

export function petitionDeadlineLabel(value: string | Date, now = new Date()) {
  const remaining = petitionDaysRemaining(value, now);
  if (remaining > 0) return `D-${remaining}`;
  if (remaining === 0) return 'D-DAY';
  return `D+${Math.abs(remaining)}`;
}

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
