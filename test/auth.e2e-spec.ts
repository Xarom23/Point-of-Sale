import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let username: string;
  let password: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const config = app.get(ConfigService);
    username = config.getOrThrow('ADMIN_USERNAME');
    password = config.getOrThrow('ADMIN_PASSWORD');
  });

  afterAll(() => app.close());

  const login = (body: object) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  it('returns a JWT with valid credentials', async () => {
    const res = await login({ username, password }).expect(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username, role: 'admin' });
  });

  it('never exposes the password hash', async () => {
    const res = await login({ username, password }).expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('rejects a wrong password with 401', () =>
    login({ username, password: 'wrong-password' }).expect(401));

  it('rejects an unknown user with 401', () =>
    login({ username: 'nobody', password }).expect(401));

  it('rejects an invalid body with 400', () =>
    login({ username: '' }).expect(400));
});
