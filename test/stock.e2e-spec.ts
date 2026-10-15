import { createTestApp } from './helpers.js';

describe('Stock adjustments (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const adjust = (body: object, id = 1) =>
    admin().post(`/products/${id}/stock-adjustments`, body);
  const stock = async () =>
    (await admin().get('/products/1').expect(200)).body.stock as number;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.truncate('stock_adjustments', 'products', 'categories');
    await admin().post('/categories', { name: 'General' }).expect(201);
    await admin()
      .post('/products', {
        name: 'A',
        sku: 'A',
        priceCents: 1000,
        stock: 10,
        minStock: 0,
        categoryId: 1,
      })
      .expect(201);
  });
  afterAll(() => ctx.app.close());

  it('adds and removes stock, returning the product', async () => {
    const res = await adjust({ delta: 5, reason: 'Compra' }).expect(201);
    expect(res.body).toMatchObject({ id: 1, stock: 15 });

    await adjust({ delta: -3, reason: 'Merma' }).expect(201);
    expect(await stock()).toBe(12);
  });

  it('records who adjusted, by how much and why, newest first', async () => {
    await adjust({ delta: 5, reason: 'Compra' });
    await adjust({ delta: -2, reason: 'Merma' });

    const res = await admin().get('/products/1/stock-adjustments').expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({
        delta: -2,
        reason: 'Merma',
        user: expect.objectContaining({ username: ctx.users.admin.username }),
      }),
      expect.objectContaining({ delta: 5, reason: 'Compra' }),
    ]);
  });

  it('never leaves stock negative (409, unchanged)', async () => {
    await adjust({ delta: -11, reason: 'Merma' }).expect(409);
    expect(await stock()).toBe(10);
    await adjust({ delta: -10, reason: 'Conteo' }).expect(201);
    expect(await stock()).toBe(0);
  });

  it.each([
    ['a zero delta', { delta: 0, reason: 'x' }],
    ['a fractional delta', { delta: 1.5, reason: 'x' }],
    ['a missing reason', { delta: 1 }],
  ])('rejects %s with 400', async (_, body) => {
    await adjust(body).expect(400);
  });

  it('returns 404 for an unknown product', async () => {
    await adjust({ delta: 1, reason: 'x' }, 99).expect(404);
  });

  it('is admin-only', async () => {
    await ctx
      .http('cashier')
      .post('/products/1/stock-adjustments', { delta: 1, reason: 'x' })
      .expect(403);
  });
});
