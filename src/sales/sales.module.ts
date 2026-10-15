import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale, SaleItem } from './sale.entity.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, SaleItem])],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
