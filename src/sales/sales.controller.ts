import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, type JwtPayload } from '../auth/auth.guard.js';
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

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

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
