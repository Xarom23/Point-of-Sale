import { Controller, Get } from '@nestjs/common';
import { Roles } from './../src/auth/auth.guard.js';
import { Role } from './../src/users/user.entity.js';
import { createTestApp } from './helpers.js';

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
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp([ProbeController]);
  });

  afterAll(() => ctx.app.close());

  it('rejects requests without a token with 401', () =>
    ctx.http().get('/probe/any').expect(401));

  it('rejects an invalid token with 401', () =>
    ctx
      .http()
      .get('/probe/any')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401));

  it('lets any authenticated user through unrestricted routes', () =>
    ctx.http('cashier').get('/probe/any').expect(200));

  it('forbids a cashier on admin routes with 403', () =>
    ctx.http('cashier').get('/probe/admin').expect(403));

  it('lets an admin through admin routes', () =>
    ctx.http('admin').get('/probe/admin').expect(200));

  it('GET /auth/me returns the current user', async () => {
    const res = await ctx.http('cashier').get('/auth/me').expect(200);
    expect(res.body).toMatchObject({
      sub: ctx.users.cashier.id,
      username: 'test-cashier',
      role: 'cashier',
    });
  });
});
