import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { DataSource } from 'typeorm';
import { CurrentUser, type JwtPayload, Roles } from '../auth/auth.guard.js';
import { Role } from '../users/user.entity.js';
import { Product } from './product.entity.js';
import { StockAdjustment } from './stock-adjustment.entity.js';

export class StockAdjustmentDto {
  /** Units to add (positive) or remove (negative). */
  @IsInt()
  @NotEquals(0)
  delta: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}

@Roles(Role.Admin)
@Controller('products/:id/stock-adjustments')
export class StockAdjustmentsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  findAll(@Param('id', ParseIntPipe) productId: number) {
    return this.dataSource.getRepository(StockAdjustment).find({
      where: { productId },
      relations: { user: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  @Post()
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() { delta, reason }: StockAdjustmentDto,
    @CurrentUser() me: JwtPayload,
  ) {
    return this.dataSource.transaction(async (em) => {
      // One conditional UPDATE: atomic with concurrent sales, never negative.
      const { affected } = await em
        .createQueryBuilder()
        .update(Product)
        .set({ stock: () => '"stock" + :delta' })
        .where('id = :id AND active AND "stock" + :delta >= 0')
        .setParameters({ id, delta })
        .execute();
      if (!affected) {
        const exists = await em.existsBy(Product, { id, active: true });
        throw exists
          ? new ConflictException('Stock cannot go below zero')
          : new NotFoundException();
      }
      await em.insert(StockAdjustment, {
        productId: id,
        userId: me.sub,
        delta,
        reason,
      });
      return em.findOneByOrFail(Product, { id });
    });
  }
}
