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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Roles } from '../auth/auth.guard.js';
import { Role } from '../users/user.entity.js';
import { Category } from './category.entity.js';

export class CategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  @Get()
  findAll() {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  @Roles(Role.Admin)
  @Post()
  create(@Body() dto: CategoryDto) {
    return this.categories.save(this.categories.create(dto));
  }

  @Roles(Role.Admin)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CategoryDto,
  ) {
    const category = await this.categories.findOneByOrFail({ id });
    return this.categories.save(this.categories.merge(category, dto));
  }

  @Roles(Role.Admin)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const { affected } = await this.categories.delete(id);
    if (!affected) throw new NotFoundException();
  }
}
