import type { ArgumentsHost } from '@nestjs/common';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { DbExceptionFilter } from './db-exception.filter.js';

/** Runs the filter and returns the HTTP status it answered with. */
function statusFor(err: Error) {
  let status = 0;
  const res = {
    status: (s: number) => ((status = s), res),
    json: () => res,
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new DbExceptionFilter().catch(err as QueryFailedError, host);
  return status;
}

const pgError = (code: string, detail = '') =>
  new QueryFailedError(
    'SELECT 1',
    [],
    Object.assign(new Error(), { code, detail }),
  );

describe('DbExceptionFilter', () => {
  it('maps a missing entity to 404', () => {
    expect(statusFor(new EntityNotFoundError('Product', { id: 1 }))).toBe(404);
  });

  it.each([
    ['23505', 'Key (sku)=(A) already exists.', 409], // unique violation
    ['23503', 'Key (id)=(1) is still referenced', 409], // FK: in use
    ['23503', 'Key (categoryId)=(9) is not present', 400], // FK: missing
    ['22003', '', 400], // integer out of range
    ['22P02', '', 400], // invalid text representation
    ['22021', '', 400], // null byte in a string
    ['40P01', '', 500], // deadlock: a server problem, not the client's
  ])('maps pg error %s (%s) to %i', (code, detail, status) => {
    expect(statusFor(pgError(code, detail))).toBe(status);
  });
});
