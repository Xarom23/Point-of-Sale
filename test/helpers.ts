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
  const sign = ({ id, username, role }: User) =>
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

  return { app, http, truncate, users };
}
