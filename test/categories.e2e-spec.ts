import { createTestApp } from './helpers.js';

describe('Categories (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.truncate('categories'));
  afterAll(() => ctx.app.close());

  it('lets an admin create a category', async () => {
    const res = await admin().post('/categories', { name: 'Bebidas' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, name: 'Bebidas' });
  });

  it('rejects a duplicate name with 409', async () => {
    await admin().post('/categories', { name: 'Bebidas' }).expect(201);
    await admin().post('/categories', { name: 'Bebidas' }).expect(409);
  });

  it('rejects an empty name with 400', () =>
    admin().post('/categories', { name: '' }).expect(400));

  it('lists categories by name for any authenticated user', async () => {
    await admin().post('/categories', { name: 'Snacks' });
    await admin().post('/categories', { name: 'Bebidas' });

    const res = await ctx.http('cashier').get('/categories').expect(200);

    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      'Bebidas',
      'Snacks',
    ]);
  });

  it('lets an admin rename a category', async () => {
    await admin().post('/categories', { name: 'Bebida' });
    const res = await admin()
      .patch('/categories/1', { name: 'Bebidas' })
      .expect(200);
    expect(res.body).toEqual({ id: 1, name: 'Bebidas' });
  });

  it('returns 404 for an unknown category', () =>
    admin().patch('/categories/99', { name: 'X' }).expect(404));

  it('lets an admin delete a category', async () => {
    await admin().post('/categories', { name: 'Bebidas' });
    await admin().delete('/categories/1').expect(204);
    await admin().delete('/categories/1').expect(404);
  });

  it('forbids a cashier from writing with 403', () =>
    ctx.http('cashier').post('/categories', { name: 'X' }).expect(403));
});
