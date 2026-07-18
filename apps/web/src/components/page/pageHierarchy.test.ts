import { describe, expect, it } from 'vitest';
import {
  detailBreadcrumbs,
  listBreadcrumbs,
  portalPageHierarchy,
  taskBreadcrumbs,
} from './pageHierarchy';

describe('portal page hierarchy', () => {
  it('uses the global navigation category for every portal feature', () => {
    expect(listBreadcrumbs('notices')).toEqual([{ label: '소식·일정' }, { label: '공지사항' }]);
    expect(listBreadcrumbs('activityRequests')).toEqual([
      { label: '학교생활' },
      { label: '탐구활동서' },
    ]);
    expect(listBreadcrumbs('board')).toEqual([{ label: '커뮤니티' }, { label: '자유게시판' }]);
    expect(listBreadcrumbs('jbs')).toEqual([{ label: '방송·도구' }, { label: 'JBS' }]);
  });

  it('omits a redundant detail crumb while preserving the feature link', () => {
    expect(detailBreadcrumbs('board')).toEqual([
      { label: '커뮤니티' },
      { label: '자유게시판', to: '/boards/free' },
    ]);
    expect(detailBreadcrumbs('board')).not.toContainEqual({ label: '상세' });
  });

  it('places work labels after the linked feature', () => {
    expect(taskBreadcrumbs('activityRequests', '신청')).toEqual([
      { label: '학교생활' },
      { label: '탐구활동서', to: '/activity-requests' },
      { label: '신청' },
    ]);
  });

  it('keeps every configured destination unique', () => {
    const destinations = Object.values(portalPageHierarchy).map(({ to }) => to);
    expect(new Set(destinations).size).toBe(destinations.length);
  });
});
