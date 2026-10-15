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

// Its own app, so the in-memory attempt counters start empty.
describe('Login brute-force protection (e2e)', () => {
  const LIMIT = 5; // attempts per username and IP per minute
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

  const login = (body: object, ip = '203.0.113.1') =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send(body);

  it('answers 429 after too many attempts, even with the right password', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login({ username, password: `guess-${i}` }).expect(401);
    }
    const res = await login({ username, password }).expect(429);
    expect(res.body).toMatchObject({ statusCode: 429 });
  });

  it('keeps counting other usernames separately', () =>
    login({ username: 'someone-else', password }).expect(401));

  it('is not bypassed by spoofing X-Forwarded-For', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login({ username: 'ghost', password }, `198.51.100.${i}`).expect(
        401,
      );
    }
    await login({ username: 'ghost', password }, '198.51.100.99').expect(429);
  });
});
