import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/auth.guard.js';
import { DateRangeDto, inDateRange, localDate } from '../common/date-range.js';
import { Sale, SaleItem } from '../sales/sale.entity.js';
import { Role } from '../users/user.entity.js';

const GROUPS = { day: 'YYYY-MM-DD', month: 'YYYY-MM' } as const;

export class SummaryQueryDto extends DateRangeDto {
  @IsOptional()
  @IsIn(Object.keys(GROUPS))
  groupBy: keyof typeof GROUPS = 'day';
}

export class TopProductsQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

// Sums are bigint in Postgres (returned as strings), so they're converted here.
@Roles(Role.Admin)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get timezone() {
    return this.config.get<string>('APP_TIMEZONE', 'America/Mexico_City');
  }

  /** Sales count and revenue per local day or month. */
  @Get('summary')
  async summary(@Query() { groupBy, ...range }: SummaryQueryDto) {
    const period = `to_char(${localDate('s.createdAt')}, :format)`;
    const query = this.dataSource
      .createQueryBuilder()
      .from(Sale, 's')
      .select(period, 'period')
      .addSelect('COUNT(*)', 'salesCount')
      .addSelect('SUM(s.totalCents)', 'totalCents')
      .setParameter('format', GROUPS[groupBy])
      .groupBy('period')
      .orderBy('period');
    const rows = await inDateRange(
      query,
      's.createdAt',
      range,
      this.timezone,
    ).getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      period: r.period,
      salesCount: Number(r.salesCount),
      totalCents: Number(r.totalCents),
    }));
  }

  /** Products ranked by units sold (revenue at list price, before discounts). */
  @Get('top-products')
  async topProducts(@Query() { limit, ...range }: TopProductsQueryDto) {
    const query = this.dataSource
      .createQueryBuilder()
      .from(SaleItem, 'i')
      .innerJoin('i.sale', 's')
      .innerJoin('i.product', 'p')
      .select('i.productId', 'productId')
      .addSelect('p.name', 'name')
      .addSelect('SUM(i.qty)', 'qty')
      .addSelect('SUM(i.qty * i.unitPriceCents)', 'totalCents')
      .groupBy('i.productId')
      .addGroupBy('p.name')
      .orderBy('qty', 'DESC')
      .addOrderBy('"totalCents"', 'DESC')
      .limit(limit);
    const rows = await inDateRange(
      query,
      's.createdAt',
      range,
      this.timezone,
    ).getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      productId: Number(r.productId),
      name: r.name,
      qty: Number(r.qty),
      totalCents: Number(r.totalCents),
    }));
  }
}
