import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { InjectRepository } from '@nestjs/typeorm';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { Roles } from '../auth/auth.guard.js';
import { Role } from '../users/user.entity.js';
import { Product } from './product.entity.js';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sku: string;

  @IsInt()
  @Min(0)
  priceCents: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsInt()
  @Min(0)
  minStock: number;

  @IsInt()
  categoryId: number;
}

// Stock only changes through sales and stock adjustments.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['stock'] as const),
) {}

@Controller('products')
export class ProductsController {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  @Get()
  findAll(@Query('q') q?: string, @Query('lowStock') lowStock?: string) {
    const query = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'c')
      .where('p.active')
      .orderBy('p.name');
    if (q) {
      query.andWhere('(p.name ILIKE :q OR p.sku ILIKE :q)', { q: `%${q}%` });
    }
    if (lowStock === 'true') query.andWhere('p.stock <= p.minStock');
    return query.getMany();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.products.findOneOrFail({
      where: { id, active: true },
      relations: { category: true },
    });
  }

  @Roles(Role.Admin)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.save(this.products.create(dto));
  }

  @Roles(Role.Admin)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.products.findOneByOrFail({ id, active: true });
    return this.products.save(this.products.merge(product, dto));
  }

  @Roles(Role.Admin)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const { affected } = await this.products.update(
      { id, active: true },
      { active: false },
    );
    if (!affected) throw new NotFoundException();
  }
}
