import { DataSource } from 'typeorm';
import { createTestApp } from './helpers.js';

const maria = { username: 'maria', password: 'secreta123', role: 'cashier' };

describe('Users (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const login = (username: string, password: string) =>
    ctx.http().post('/auth/login', { username, password });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  // Keep the seeded admin and the helper's cashier; drop everyone else.
  beforeEach(() =>
    ctx.app
      .get(DataSource)
      .query(`DELETE FROM users WHERE id NOT IN ($1, $2)`, [
        ctx.users.admin.id,
        ctx.users.cashier.id,
      ]),
  );
  afterAll(() => ctx.app.close());

  const create = async (body = maria) =>
    (await admin().post('/users', body).expect(201)).body as { id: number };

  it('lets an admin create a user who can then log in', async () => {
    const res = await admin().post('/users', maria).expect(201);

    expect(res.body).toMatchObject({
      username: 'maria',
      role: 'cashier',
      active: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    await login('maria', 'secreta123').expect(200);
  });

  it('rejects a duplicate username with 409', async () => {
    await create();
    await admin().post('/users', maria).expect(409);
  });

  it.each([
    ['a short password', { password: 'corta' }],
    ['an unknown role', { role: 'owner' }],
    ['an empty username', { username: '' }],
  ])('rejects %s with 400', async (_, patch) => {
    await admin()
      .post('/users', { ...maria, ...patch })
      .expect(400);
  });

  it('lists users by username without password hashes', async () => {
    await create();
    const res = await admin().get('/users').expect(200);

    const names = res.body.map((u: { username: string }) => u.username);
    expect(names).toEqual(
      [...names].sort((x: string, y: string) => x.localeCompare(y)),
    );
    expect(names).toContain('maria');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('blocks login once a user is deactivated', async () => {
    const { id } = await create();
    const res = await admin()
      .patch(`/users/${id}`, { active: false })
      .expect(200);

    expect(res.body.active).toBe(false);
    await login('maria', 'secreta123').expect(401);
  });

  it('changes the role and resets the password', async () => {
    const { id } = await create();
    const res = await admin()
      .patch(`/users/${id}`, { role: 'admin', password: 'nueva-clave' })
      .expect(200);

    expect(res.body.role).toBe('admin');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    await login('maria', 'secreta123').expect(401);
    await login('maria', 'nueva-clave').expect(200);
  });

  it('does not let an admin deactivate or demote themselves', async () => {
    const self = `/users/${ctx.users.admin.id}`;
    await admin().patch(self, { active: false }).expect(400);
    await admin().patch(self, { role: 'cashier' }).expect(400);
  });

  it('returns 404 for an unknown user', async () => {
    await admin().patch('/users/99999', { active: false }).expect(404);
  });

  it('is admin-only', async () => {
    await ctx.http('cashier').get('/users').expect(403);
    await ctx.http('cashier').post('/users', maria).expect(403);
  });
});
