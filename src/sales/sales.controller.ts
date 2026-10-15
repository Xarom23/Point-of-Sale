import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, type JwtPayload } from '../auth/auth.guard.js';
import { DateRangeDto } from '../common/date-range.js';
import { SalesService } from './sales.service.js';

class SaleItemDto {
  @IsInt()
  @Min(1)
  productId: number;

  @IsInt()
  @Min(1)
  qty: number;
}

class DiscountDto {
  @IsIn(['percent', 'amount'])
  type: 'percent' | 'amount';

  /** Whole percent (10 = 10%) or cents. */
  @IsInt()
  @Min(0)
  value: number;
}

// Totals are computed server-side; any sent by the client are stripped.
export class CreateSaleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

export class SalesQueryDto extends DateRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() { page, limit, ...range }: SalesQueryDto,
  ) {
    return this.sales.list(user, range, page, limit);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() { items, discount }: CreateSaleDto,
  ) {
    return this.sales.create(user.sub, items, discount);
  }

  // Declared before :id so "config" isn't parsed as an id.
  @Get('config')
  config() {
    return { taxRate: this.sales.taxRate };
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sales.findOne(id, user);
  }
}
