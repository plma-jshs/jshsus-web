import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { allocateStaffNumber } from './staff-number';

describe('allocateStaffNumber', () => {
  it('keeps parallel claims unique when backed by one atomic sequence', async () => {
    let next = 100000;
    let queue = Promise.resolve();
    const claim = () => {
      const result = queue.then(() => next++);
      queue = result.then(() => undefined);
      return result;
    };

    const issued = await Promise.all(Array.from({ length: 250 }, () => allocateStaffNumber(claim)));
    expect(new Set(issued).size).toBe(250);
    expect(issued[0]).toBe(100000);
    expect(issued.at(-1)).toBe(100249);
  });

  it('rejects an exhausted sequence', async () => {
    await expect(allocateStaffNumber(async () => 1000000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
