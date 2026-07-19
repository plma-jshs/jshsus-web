export type BreadcrumbItem = { label: string; to?: string };

export type PortalPageKey =
  | 'notices'
  | 'calendar'
  | 'activityRequests'
  | 'myStatus'
  | 'points'
  | 'lostItems'
  | 'board'
  | 'petitions'
  | 'thanks'
  | 'jbs'
  | 'wakeSongs'
  | 'byteCalculator';

type PageHierarchy = {
  section: '소식·일정' | '학교생활' | '커뮤니티' | '방송·도구';
  feature: string;
  to: string;
};

export const portalPageHierarchy: Record<PortalPageKey, PageHierarchy> = {
  notices: { section: '소식·일정', feature: '공지사항', to: '/notices' },
  calendar: { section: '소식·일정', feature: '학사일정', to: '/calendar' },
  activityRequests: {
    section: '학교생활',
    feature: '탐구활동서',
    to: '/activity-requests',
  },
  myStatus: { section: '학교생활', feature: '마이페이지', to: '/my-status' },
  points: { section: '학교생활', feature: '상벌점', to: '/points' },
  lostItems: { section: '학교생활', feature: '분실물', to: '/lost-items' },
  board: { section: '커뮤니티', feature: '자유게시판', to: '/boards/free' },
  petitions: { section: '커뮤니티', feature: '청원·제안', to: '/petitions' },
  thanks: { section: '커뮤니티', feature: '감사챌린지', to: '/thanks' },
  jbs: { section: '방송·도구', feature: 'JBS', to: '/jbs' },
  wakeSongs: { section: '방송·도구', feature: '기상곡 신청', to: '/wake-songs' },
  byteCalculator: {
    section: '방송·도구',
    feature: '세특 바이트 계산기',
    to: '/tools/bytes',
  },
};

export function listBreadcrumbs(page: PortalPageKey): BreadcrumbItem[] {
  const { section, feature } = portalPageHierarchy[page];
  return [{ label: section }, { label: feature }];
}

/** 상세 화면은 불필요한 `상세` 단계를 만들지 않고 기능 목록까지만 안내합니다. */
export function detailBreadcrumbs(page: PortalPageKey): BreadcrumbItem[] {
  const { section, feature, to } = portalPageHierarchy[page];
  return [{ label: section }, { label: feature, to }];
}

export function taskBreadcrumbs(page: PortalPageKey, task: string): BreadcrumbItem[] {
  return [...detailBreadcrumbs(page), { label: task }];
}
