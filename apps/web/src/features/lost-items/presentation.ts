import type { LostItemSummary } from '@jshsus/types';

export const lostStatusLabels: Record<LostItemSummary['status'], string> = {
  open: '처리 중',
  matched: '연결됨',
  closed: '완료',
  hidden: '숨김',
};
