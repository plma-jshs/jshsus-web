import { BadRequestException } from '@nestjs/common';

export const FIRST_STAFF_NUMBER = 100000;
export const LAST_STAFF_NUMBER = 999999;

/**
 * The callback must claim and increment a sequence in one database transaction.
 * Keeping range validation here makes every issuer obey the six-digit contract.
 */
export async function allocateStaffNumber(claimNext: () => Promise<number>): Promise<number> {
  const value = await claimNext();
  if (!Number.isSafeInteger(value) || value < FIRST_STAFF_NUMBER || value > LAST_STAFF_NUMBER) {
    throw new BadRequestException('No six-digit teacher numbers remain.');
  }
  return value;
}
