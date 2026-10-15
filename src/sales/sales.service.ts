import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import type { JwtPayload } from '../auth/auth.guard.js';
import { type DateRangeDto, inDateRange } from '../common/date-range.js';
import { Product } from '../products/product.entity.js';
import { Role } from '../users/user.entity.js';
import { Sale } from './sale.entity.js';
import { calculateTotals, type Discount } from './totals.js';

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  get taxRate() {
    return Number(this.config.getOrThrow('TAX_RATE'));
  }

  create(
    userId: number,
    items: { productId: number; qty: number }[],
    discount?: Discount,
  ) {
    if (discount?.type === 'percent' && discount.value > 100) {
      throw new BadRequestException('A percent discount cannot exceed 100');
    }
    // Repeated lines of a product count together against its stock.
    const qtyById = new Map<number, number>();
    for (const { productId, qty } of items) {
      qtyById.set(productId, (qtyById.get(productId) ?? 0) + qty);
    }
    const qtyOf = (p: Product) => qtyById.get(p.id) ?? 0;

    return this.dataSource.transaction(async (em) => {
      // FOR UPDATE makes concurrent sales of the same products wait, so two
      // registers can't both sell the last unit. Locking in id order avoids
      // deadlocks between overlapping carts.
      const products = await em.find(Product, {
        where: { id: In([...qtyById.keys()]), active: true },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (products.length !== qtyById.size) {
        throw new BadRequestException('Product not found');
      }
      const short = products.find((p) => p.stock < qtyOf(p));
      if (short) {
        throw new ConflictException(
          `Insufficient stock for ${short.name} (available: ${short.stock})`,
        );
      }

      for (const p of products) {
        await em.decrement(Product, { id: p.id }, 'stock', qtyOf(p));
      }
      const lines = products.map((p) => ({
        productId: p.id,
        name: p.name,
        qty: qtyOf(p),
        unitPriceCents: p.priceCents,
      }));
      const totals = calculateTotals(lines, discount, this.taxRate);
      const { id } = await em.save(
        em.create(Sale, { userId, ...totals, items: lines }),
      );
      return this.findOne(id, undefined, em.getRepository(Sale));
    });
  }

  get timezone() {
    return this.config.get<string>('APP_TIMEZONE', 'America/Mexico_City');
  }

  /** Newest first; a cashier only sees their own sales. */
  async list(
    viewer: JwtPayload,
    range: DateRangeDto,
    page: number,
    limit: number,
  ) {
    const query = this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (viewer.role === Role.Cashier) {
      query.andWhere('s.userId = :userId', { userId: viewer.sub });
    }
    inDateRange(query, 's.createdAt', range, this.timezone);
    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /** A cashier only sees their own sales; others look like a 404. */
  findOne(
    id: number,
    viewer?: JwtPayload,
    sales = this.dataSource.getRepository(Sale),
  ) {
    const ownOnly = viewer?.role === Role.Cashier;
    return sales.findOneOrFail({
      where: { id, ...(ownOnly && { userId: viewer.sub }) },
      relations: { items: true, user: true },
      order: { items: { id: 'ASC' } },
    });
  }
}
