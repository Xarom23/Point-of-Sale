import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';

type Role = 'admin' | 'cashier';

/** Boots the whole app against the dev database with role-scoped clients. */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  await app.init();

  const jwt = app.get(JwtService);
  const tokens: Record<Role, string> = {
    admin: await jwt.signAsync({ sub: 1, username: 'admin', role: 'admin' }),
    cashier: await jwt.signAsync({ sub: 2, username: 'cash', role: 'cashier' }),
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

  return { app, http, truncate };
}
