import type { LostItemSummary } from '@jshsus/types';

export const lostStatusLabels: Record<LostItemSummary['status'], string> = {
  PROCESSING: '찾는 중',
  RETURNED: '반환 완료',
};
