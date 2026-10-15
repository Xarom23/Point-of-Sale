import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../products/product.entity.js';
import { User } from '../users/user.entity.js';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  subtotalCents: number;

  @Column({ type: 'int' })
  discountCents: number;

  @Column({ type: 'int' })
  taxCents: number;

  @Column({ type: 'int' })
  totalCents: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: ['insert'] })
  items: SaleItem[];
}

/** Name and price are copied at sale time so later product edits don't rewrite history. */
@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  saleId: number;

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saleId' })
  sale: Sale;

  @Column()
  productId: number;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  name: string;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: 'int' })
  unitPriceCents: number;
}
