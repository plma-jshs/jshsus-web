import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '../../shared/auth/auth.decorators';
import { PointsController } from './points.controller';

const issueEndpoints = [
  'students',
  'studentPage',
  'createRecord',
  'createRecordBatch',
  'previewRecordImport',
  'reasons',
  'reasonPage',
] as const;

const managementEndpoints = [
  'summary',
  'records',
  'recordPage',
  'cancelRecord',
  'restoreRecord',
  'createReason',
  'updateReason',
  'departureCases',
  'departureCandidatePage',
  'departureHistoryPage',
  'syncDepartureCases',
  'completeDepartureCase',
  'dismissDepartureCase',
  'approveDeparture',
  'previewSemesterHalf',
  'applySemesterHalf',
] as const;

describe('PointsController permission boundary', () => {
  it('keeps points management as the controller default', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PointsController)).toEqual(['points.manage']);
  });

  it.each(issueEndpoints)('allows points.issue on %s', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PointsController.prototype[method])).toEqual([
      'points.issue',
    ]);
  });

  it.each(managementEndpoints)('does not weaken %s to points.issue', (method) => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, PointsController.prototype[method]),
    ).toBeUndefined();
  });
});
