import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdminController } from '../../modules/admin/admin.controller';
import { BoardsController } from '../../modules/boards/boards.controller';
import { LostItemsController } from '../../modules/lost-items/lost-items.controller';
import { NoticesController } from '../../modules/notices/notices.controller';
import { ReportsController } from '../../modules/reports/reports.controller';
import { PERMISSIONS_KEY } from './auth.decorators';

function requiredPermission(target: object) {
  return Reflect.getMetadata(PERMISSIONS_KEY, target);
}

describe('content management permission boundaries', () => {
  it.each(['adminNotices', 'createNotice', 'updateNotice', 'deleteNotice'] as const)(
    'protects notices.%s with notices.manage',
    (method) => {
      expect(requiredPermission(NoticesController.prototype[method])).toEqual(['notices.manage']);
    },
  );

  it.each([
    'adminBoardPosts',
    'adminBoardComments',
    'updatePostHidden',
    'updateCommentHidden',
  ] as const)('protects boards.%s with community.manage', (method) => {
    expect(requiredPermission(BoardsController.prototype[method])).toEqual(['community.manage']);
  });

  it.each(['reports', 'updateReportStatus'] as const)(
    'protects reports.%s with community.manage',
    (method) => {
      expect(requiredPermission(ReportsController.prototype[method])).toEqual(['community.manage']);
    },
  );

  it.each(['adminLostItems', 'updateLostItemStatus', 'deleteManagedLostItem'] as const)(
    'protects lostItems.%s with lost_items.manage',
    (method) => {
      expect(requiredPermission(LostItemsController.prototype[method])).toEqual([
        'lost_items.manage',
      ]);
    },
  );

  it.each([
    'schoolEvents',
    'schoolCalendar',
    'createSchoolEvent',
    'updateSchoolEvent',
    'deleteSchoolEvent',
  ] as const)('protects admin.%s with school_events.manage', (method) => {
    expect(requiredPermission(AdminController.prototype[method])).toEqual(['school_events.manage']);
  });
});
