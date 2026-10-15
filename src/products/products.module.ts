import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity.js';
import { ProductsController } from './products.controller.js';
import { StockAdjustment } from './stock-adjustment.entity.js';
import { StockAdjustmentsController } from './stock-adjustments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, StockAdjustment])],
  controllers: [ProductsController, StockAdjustmentsController],
})
export class ProductsModule {}
