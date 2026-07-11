import { ConflictException } from '@nestjs/common';

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
