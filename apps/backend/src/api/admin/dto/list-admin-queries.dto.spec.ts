import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListAdminBusinessesQueryDto } from './list-admin-businesses-query.dto';
import { ListAdminUsersQueryDto } from './list-admin-users-query.dto';

// Mirrors the global ValidationPipe: query strings arrive as text, then transform + validate.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

describe.each([
  ['ListAdminBusinessesQueryDto', ListAdminBusinessesQueryDto],
  ['ListAdminUsersQueryDto', ListAdminUsersQueryDto],
])('%s paging', (_name, Dto) => {
  const check = async (query: Record<string, unknown>): Promise<string[]> =>
    (await validate(plainToInstance(Dto, query), PIPE_OPTIONS)).map(error => error.property);

  it('accepts no paging at all, a page, and a page size up to the cap', async () => {
    expect(await check({})).toEqual([]);
    expect(await check({ page: '3', pageSize: '100', search: 'jane' })).toEqual([]);
  });

  // Regression: the lists were unbounded; the cap keeps any one response bounded.
  it('rejects a page size above 100, and a page or page size below 1', async () => {
    expect(await check({ pageSize: '101' })).toContain('pageSize');
    expect(await check({ pageSize: '0' })).toContain('pageSize');
    expect(await check({ page: '0' })).toContain('page');
  });

  it('rejects text where a number belongs', async () => {
    expect(await check({ page: 'abc' })).toContain('page');
  });

  it('turns the query strings into numbers', () => {
    const dto = plainToInstance(Dto, { page: '2', pageSize: '25' });

    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(25);
  });
});
