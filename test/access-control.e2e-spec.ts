import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Role, type User } from './../src/users/user.entity.js';
import { createTestApp } from './helpers.js';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Access = 'public' | 'any' | 'admin';

// Every route in the API. Ids point at rows that don't exist, so an allowed
// call ends in 400/404 at worst and never changes data.
const ROUTES: [Method, string, Access][] = [
  ['get', '/', 'public'],
  ['post', '/auth/login', 'public'],
  ['get', '/auth/me', 'any'],
  ['get', '/categories', 'any'],
  ['post', '/categories', 'admin'],
  ['patch', '/categories/999', 'admin'],
  ['delete', '/categories/999', 'admin'],
  ['get', '/products', 'any'],
  ['get', '/products/999', 'any'],
  ['post', '/products', 'admin'],
  ['patch', '/products/999', 'admin'],
  ['delete', '/products/999', 'admin'],
  ['get', '/products/999/stock-adjustments', 'admin'],
  ['post', '/products/999/stock-adjustments', 'admin'],
  ['get', '/sales', 'any'],
  ['post', '/sales', 'any'],
  ['get', '/sales/config', 'any'],
  ['get', '/sales/999', 'any'],
  ['get', '/reports/summary', 'admin'],
  ['get', '/reports/top-products', 'admin'],
  ['get', '/users', 'admin'],
  ['post', '/users', 'admin'],
  ['patch', '/users/999', 'admin'],
];
const routes = (...access: Access[]) =>
  ROUTES.filter(([, , a]) => access.includes(a));

const b64 = (part: object) =>
  Buffer.from(JSON.stringify(part)).toString('base64url');

describe('Access control (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let secret: string;
  const now = () => Math.floor(Date.now() / 1000);

  /** Builds a JWT by hand, so any header, payload or signature can be forged. */
  const forge = (
    payload: object,
    { alg = 'HS256', key = secret }: { alg?: string; key?: string } = {},
  ) => {
    const unsigned = `${b64({ alg, typ: 'JWT' })}.${b64(payload)}`;
    const signature =
      alg === 'none'
        ? ''
        : createHmac('sha256', key).update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
  };
  const cashierClaims = () => ({
    sub: ctx.users.cashier.id,
    username: 'test-cashier',
    role: 'cashier',
    iat: now(),
    exp: now() + 60,
  });
  const me = (authorization: string) =>
    ctx.http().get('/auth/me').set('Authorization', authorization);

  beforeAll(async () => {
    ctx = await createTestApp();
    secret = ctx.app.get(ConfigService).getOrThrow('JWT_SECRET');
  });
  beforeEach(async () => {
    await ctx.resetCatalog(1);
    await ctx.resetUsers();
  });
  afterAll(() => ctx.app.close());

  describe('route matrix', () => {
    it.each(routes('any', 'admin'))(
      'rejects anonymous %s %s with 401',
      async (method, url) => {
        await ctx.http()[method](url).expect(401);
      },
    );

    it.each(routes('public'))(
      'lets anonymous users reach %s %s',
      async (method, url) => {
        const { status } = await ctx.http()[method](url);
        expect([401, 403]).not.toContain(status);
      },
    );

    it.each(routes('admin'))(
      'forbids a cashier on %s %s with 403',
      async (method, url) => {
        await ctx.http('cashier')[method](url).expect(403);
      },
    );

    it.each(routes('any'))(
      'lets a cashier reach %s %s',
      async (method, url) => {
        const { status } = await ctx.http('cashier')[method](url);
        expect([401, 403]).not.toContain(status);
      },
    );

    it.each(routes('any', 'admin'))(
      'lets an admin reach %s %s',
      async (method, url) => {
        const { status } = await ctx.http('admin')[method](url);
        expect([401, 403]).not.toContain(status);
      },
    );
  });

  describe('forged and tampered tokens', () => {
    it('accepts a correctly forged token (control for the cases below)', () =>
      me(`Bearer ${forge(cashierClaims())}`).expect(200));

    it('rejects an expired token with 401', () =>
      me(`Bearer ${forge({ ...cashierClaims(), exp: now() - 1 })}`).expect(
        401,
      ));

    it('rejects a token that is not valid yet with 401', () =>
      me(`Bearer ${forge({ ...cashierClaims(), nbf: now() + 600 })}`).expect(
        401,
      ));

    it('rejects a payload altered after signing with 401', () => {
      const [head, , signature] = forge(cashierClaims()).split('.');
      const elevated = b64({ ...cashierClaims(), role: 'admin' });
      return me(`Bearer ${head}.${elevated}.${signature}`).expect(401);
    });

    it('rejects an unsigned token (alg: none) with 401', () =>
      me(
        `Bearer ${forge({ ...cashierClaims(), role: 'admin' }, { alg: 'none' })}`,
      ).expect(401));

    it('rejects a token signed with another secret with 401', () =>
      me(`Bearer ${forge(cashierClaims(), { key: 'guessed' })}`).expect(401));

    it.each(['', 'abc', 'a.b.c', '...', `${'x'.repeat(4000)}`])(
      'rejects the malformed token "%s" with 401',
      async (token) => {
        await me(`Bearer ${token}`).expect(401);
      },
    );

    it('rejects a valid token for a user that does not exist with 401', () =>
      me(`Bearer ${forge({ ...cashierClaims(), sub: 999_999 })}`).expect(401));
  });

  describe('revocation: the database, not the token, is the authority', () => {
    const createUser = async (role: Role) =>
      (
        await ctx
          .http('admin')
          .post('/users', {
            username: `u-${role}`,
            password: 'secreta123',
            role,
          })
          .expect(201)
      ).body as Pick<User, 'id' | 'username' | 'role'>;
    const bearer = async (user: Parameters<typeof ctx.sign>[0]) =>
      `Bearer ${await ctx.sign(user)}`;

    it('rejects the still-valid token of a deactivated user with 401', async () => {
      const user = await createUser(Role.Cashier);
      const auth = await bearer(user);
      await me(auth).expect(200);

      await ctx
        .http('admin')
        .patch(`/users/${user.id}`, { active: false })
        .expect(200);
      await me(auth).expect(401);
    });

    it('drops admin rights as soon as an admin is demoted', async () => {
      const user = await createUser(Role.Admin);
      const auth = await bearer(user);
      await ctx.http().get('/users').set('Authorization', auth).expect(200);

      await ctx
        .http('admin')
        .patch(`/users/${user.id}`, { role: 'cashier' })
        .expect(200);
      await ctx.http().get('/users').set('Authorization', auth).expect(403);
    });

    it('ignores a role claim that does not match the user', async () => {
      const { id, username } = ctx.users.cashier;
      const auth = await bearer({ id, username, role: Role.Admin });
      await ctx.http().get('/users').set('Authorization', auth).expect(403);
    });
  });

  describe('malicious or misplaced credentials', () => {
    let token: string;
    beforeEach(async () => {
      token = await ctx.sign(ctx.users.admin);
    });

    it.each([
      ['a scheme without a token', () => 'Bearer'],
      ['Basic credentials', () => `Basic ${btoa('admin:admin')}`],
      ['a doubled space', () => `Bearer  ${token}`],
      ['the token alone', () => token],
    ])('rejects %s with 401', async (_, header) => {
      await me(header()).expect(401);
    });

    it('ignores a token sent in the query string', () =>
      ctx.http().get(`/auth/me?access_token=${token}`).expect(401));

    // No auth cookie exists, so a cross-site form post carries no
    // credentials: there is no CSRF surface.
    it('ignores a token sent as a cookie', () =>
      ctx
        .http()
        .get('/auth/me')
        .set('Cookie', `token=${token}; access_token=${token}`)
        .expect(401));

    it('rejects oversized headers with 431 and keeps serving', async () => {
      await ctx
        .http('admin')
        .get('/auth/me')
        .set('X-Padding', 'a'.repeat(20_000))
        .expect(431);
      await ctx.http('admin').get('/auth/me').expect(200);
    });
  });

  describe('insecure direct object references', () => {
    it('ignores a userId filter, so a cashier still sees only own sales', async () => {
      const sale = { items: [{ productId: 1, qty: 1 }] };
      await ctx.http('admin').post('/sales', sale).expect(201);
      await ctx.http('cashier').post('/sales', sale).expect(201);

      const res = await ctx
        .http('cashier')
        .get(`/sales?userId=${ctx.users.admin.id}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].userId).toBe(ctx.users.cashier.id);
    });

    it('records a sale under the caller even if the body names another user', async () => {
      const res = await ctx
        .http('cashier')
        .post('/sales', {
          userId: ctx.users.admin.id,
          items: [{ productId: 1, qty: 1 }],
        })
        .expect(201);
      expect(res.body.userId).toBe(ctx.users.cashier.id);
    });
  });
});
