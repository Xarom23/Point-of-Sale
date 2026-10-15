import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Role as UserRole, User } from './../src/users/user.entity.js';

type Role = 'admin' | 'cashier';

/** Boots the whole app against the dev database with role-scoped clients. */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  await app.init();

  // Tokens belong to real rows because sales reference their user.
  const userRepo = app.get(DataSource).getRepository(User);
  const users: Record<Role, User> = {
    admin: await userRepo.findOneByOrFail({ role: UserRole.Admin }),
    cashier:
      (await userRepo.findOneBy({ username: 'test-cashier' })) ??
      (await userRepo.save({
        username: 'test-cashier',
        passwordHash: '!', // not a bcrypt hash, so it can never log in
        role: UserRole.Cashier,
      })),
  };
  const jwt = app.get(JwtService);
  const sign = ({
    id,
    username,
    role,
  }: Pick<User, 'id' | 'username' | 'role'>) =>
    jwt.signAsync({ sub: id, username, role });
  const tokens: Record<Role, string> = {
    admin: await sign(users.admin),
    cashier: await sign(users.cashier),
  };

  /** HTTP client authenticated as `role`, or anonymous when omitted. */
  const http = (role?: Role) => {
    const server = app.getHttpServer();
    const auth = (req: request.Test) =>
      role ? req.set('Authorization', `Bearer ${tokens[role]}`) : req;
    return {
      get: (url: string) => auth(request(server).get(url)),
      post: (url: string, body?: object) =>
        auth(request(server).post(url)).send(body),
      patch: (url: string, body?: object) =>
        auth(request(server).patch(url)).send(body),
      delete: (url: string) => auth(request(server).delete(url)),
    };
  };

  const truncate = (...tables: string[]) =>
    app
      .get(DataSource)
      .query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

  /** Empties sales and the catalog, then creates category 1 and `count` products. */
  const resetCatalog = async (count = 1, product: object = {}) => {
    await truncate(
      'sale_items',
      'sales',
      'stock_adjustments',
      'products',
      'categories',
    );
    await http('admin').post('/categories', { name: 'General' }).expect(201);
    const products: { id: number; stock: number }[] = [];
    for (let i = 1; i <= count; i++) {
      const n = String(i).padStart(3, '0');
      const res = await http('admin')
        .post('/products', {
          name: `Product ${n}`,
          sku: `SKU-${n}`,
          priceCents: 1000,
          stock: 10,
          minStock: 0,
          categoryId: 1,
          ...product,
        })
        .expect(201);
      products.push(res.body);
    }
    return products;
  };

  /** Deletes every user except the admin and the helper's cashier. */
  const resetUsers = () =>
    app
      .get(DataSource)
      .query(`DELETE FROM users WHERE id NOT IN ($1, $2)`, [
        users.admin.id,
        users.cashier.id,
      ]);

  return { app, http, truncate, users, sign, resetCatalog, resetUsers };
}
