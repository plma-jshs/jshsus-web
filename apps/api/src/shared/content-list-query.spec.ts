import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseContentListQuery, toContainsPattern } from './content-list-query';

describe('content list query', () => {
  it('applies bounded pagination and search defaults', () => {
    expect(parseContentListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      field: 'title_content',
      q: '',
    });
    expect(
      parseContentListQuery({ page: '2', pageSize: '20', field: 'author', q: ' 학생 ' }),
    ).toEqual({ page: 2, pageSize: 20, field: 'author', q: '학생' });
  });

  it('rejects unsupported fields and page sizes', () => {
    expect(() => parseContentListQuery({ field: 'content' })).toThrow(BadRequestException);
    expect(parseContentListQuery({ pageSize: 100 }).pageSize).toBe(100);
    expect(() => parseContentListQuery({ pageSize: 30 })).toThrow(BadRequestException);
  });

  it('escapes SQL LIKE wildcard characters', () => {
    expect(toContainsPattern('100%_ok')).toBe('%100\\%\\_ok%');
  });
});
