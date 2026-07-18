import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseIdentityListQuery } from './identity-list-query';

describe('parseIdentityListQuery', () => {
  it('applies stable paging defaults', () => {
    expect(parseIdentityListQuery({})).toMatchObject({
      page: 1,
      pageSize: 20,
      q: '',
      sortOrder: 'asc',
    });
  });

  it('coerces query-string filters', () => {
    expect(
      parseIdentityListQuery({
        page: '3',
        pageSize: '50',
        q: '  김성찬  ',
        grade: '3',
        classNo: '4',
        status: 'active',
      }),
    ).toEqual({
      page: 3,
      pageSize: 50,
      q: '김성찬',
      grade: 3,
      classNo: 4,
      status: 'active',
      sortOrder: 'asc',
    });
  });

  it('rejects page sizes that could bypass the server limit', () => {
    expect(() => parseIdentityListQuery({ pageSize: '101' })).toThrow(BadRequestException);
  });
});
