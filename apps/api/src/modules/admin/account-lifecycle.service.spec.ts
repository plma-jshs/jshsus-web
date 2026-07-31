import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertManagedStatusMatchesIdentity } from './account-lifecycle.service';

describe('assertManagedStatusMatchesIdentity', () => {
  it.each([
    ['student', 'active'],
    ['student', 'graduated'],
    ['staff', 'active'],
    ['staff', 'deleted'],
    [null, 'active'],
    [null, 'deleted'],
  ] as const)('allows %s identities to use %s', (identityType, status) => {
    expect(() => assertManagedStatusMatchesIdentity(identityType, status)).not.toThrow();
  });

  it.each([
    ['student', 'deleted'],
    ['staff', 'graduated'],
    [null, 'graduated'],
  ] as const)('rejects %s identities using %s', (identityType, status) => {
    expect(() => assertManagedStatusMatchesIdentity(identityType, status)).toThrow(
      BadRequestException,
    );
  });
});
