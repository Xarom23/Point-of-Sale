import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Roles } from './../src/auth/auth.guard.js';
import { Role } from './../src/users/user.entity.js';

// Test-only endpoints so the guard is exercised without depending on
// feature modules that do not exist yet.
@Controller('probe')
class ProbeController {
  @Get('any')
  any() {
    return 'ok';
  }

  @Roles(Role.Admin)
  @Get('admin')
  admin() {
    return 'ok';
  }
}

describe('Authorization (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: 1, username: 'a', role: 'admin' });
    cashierToken = await jwt.signAsync({
      sub: 2,
      username: 'c',
      role: 'cashier',
    });
  });

  afterAll(() => app.close());

  const get = (url: string, token?: string) => {
    const req = request(app.getHttpServer()).get(url);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('rejects requests without a token with 401', () =>
    get('/probe/any').expect(401));

  it('rejects an invalid token with 401', () =>
    get('/probe/any', 'not-a-jwt').expect(401));

  it('lets any authenticated user through unrestricted routes', () =>
    get('/probe/any', cashierToken).expect(200));

  it('forbids a cashier on admin routes with 403', () =>
    get('/probe/admin', cashierToken).expect(403));

  it('lets an admin through admin routes', () =>
    get('/probe/admin', adminToken).expect(200));

  it('GET /auth/me returns the current user', async () => {
    const res = await get('/auth/me', cashierToken).expect(200);
    expect(res.body).toMatchObject({ sub: 2, username: 'c', role: 'cashier' });
  });
});
