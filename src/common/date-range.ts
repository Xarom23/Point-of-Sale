import { IsISO8601, IsOptional, Matches } from 'class-validator';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive `from`/`to` calendar dates (YYYY-MM-DD) in the store timezone. */
export class DateRangeDto {
  @IsOptional()
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  to?: string;
}

/** Store-local calendar date of a timestamptz column, as SQL. */
export const localDate = (column: string) =>
  `(${column} AT TIME ZONE :timezone)::date`;

export function inDateRange<T extends ObjectLiteral>(
  query: SelectQueryBuilder<T>,
  column: string,
  { from, to }: DateRangeDto,
  timezone: string,
) {
  query.setParameter('timezone', timezone);
  if (from) query.andWhere(`${localDate(column)} >= :from`, { from });
  if (to) query.andWhere(`${localDate(column)} <= :to`, { to });
  return query;
}
