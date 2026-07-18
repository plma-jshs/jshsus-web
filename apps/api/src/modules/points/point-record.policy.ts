import { ConflictException } from '@nestjs/common';
import { isSystemPointRecord } from './point-lifecycle.policy';

export function assertPointRecordCanBeAdjusted(input: {
  teacherStudentNo: number | null;
  reason: string;
}) {
  if (isSystemPointRecord(input)) {
    throw new ConflictException(
      '시스템 조정 기록은 개별 취소하거나 복원할 수 없습니다. 시스템 작업 단위로 관리해 주세요.',
    );
  }
}

export function assertPointRecordCanBeCanceled(canceledAt: Date | null) {
  if (canceledAt) {
    throw new ConflictException('Point record is already canceled.');
  }
}

export function assertPointRecordCanBeRestored(canceledAt: Date | null) {
  if (!canceledAt) {
    throw new ConflictException('Point record is not canceled.');
  }
}
