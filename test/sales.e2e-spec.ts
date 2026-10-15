import { createTestApp } from './helpers.js';

// TAX_RATE=0.16 (see .env.example); prices include tax
describe('Sales (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const cashier = () => ctx.http('cashier');
  const stockOf = async (id: number) =>
    (await admin().get(`/products/${id}`).expect(200)).body.stock as number;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.truncate('sale_items', 'sales', 'products', 'categories');
    await admin().post('/categories', { name: 'General' }).expect(201);
    const base = { minStock: 0, categoryId: 1 };
    await admin()
      .post('/products', {
        ...base,
        name: 'A',
        sku: 'A',
        priceCents: 1000,
        stock: 5,
      })
      .expect(201);
    await admin()
      .post('/products', {
        ...base,
        name: 'B',
        sku: 'B',
        priceCents: 2500,
        stock: 2,
      })
      .expect(201);
  });
  afterAll(() => ctx.app.close());

  it('registers a sale, computes totals and decrements stock', async () => {
    const res = await cashier()
      .post('/sales', {
        items: [
          { productId: 1, qty: 2 },
          { productId: 2, qty: 1 },
        ],
        discount: { type: 'percent', value: 10 },
      })
      .expect(201);

    expect(res.body).toMatchObject({
      id: 1,
      userId: ctx.users.cashier.id,
      subtotalCents: 4500,
      discountCents: 450,
      taxCents: 559,
      totalCents: 4050,
    });
    expect(res.body.items).toEqual([
      expect.objectContaining({
        productId: 1,
        name: 'A',
        qty: 2,
        unitPriceCents: 1000,
      }),
      expect.objectContaining({
        productId: 2,
        name: 'B',
        qty: 1,
        unitPriceCents: 2500,
      }),
    ]);
    expect(await stockOf(1)).toBe(3);
    expect(await stockOf(2)).toBe(1);
  });

  it('rejects the whole sale with 409 when one item lacks stock', async () => {
    const res = await cashier()
      .post('/sales', {
        items: [
          { productId: 1, qty: 1 },
          { productId: 2, qty: 3 },
        ],
      })
      .expect(409);

    expect(res.body.message).toContain('B');
    expect(await stockOf(1)).toBe(5);
    expect(await stockOf(2)).toBe(2);
  });

  it('never oversells under concurrent checkouts', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        cashier().post('/sales', { items: [{ productId: 2, qty: 1 }] }),
      ),
    );

    const statuses = attempts.map((r) => r.status).sort((x, y) => x - y);
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    expect(await stockOf(2)).toBe(0);
  });

  it('adds up repeated lines of the same product before checking stock', async () => {
    await cashier()
      .post('/sales', {
        items: [
          { productId: 1, qty: 3 },
          { productId: 1, qty: 3 },
        ],
      })
      .expect(409);
    expect(await stockOf(1)).toBe(5);
  });

  it('ignores totals sent by the client', async () => {
    const res = await cashier()
      .post('/sales', {
        items: [{ productId: 1, qty: 1 }],
        totalCents: 1,
        subtotalCents: 1,
      })
      .expect(201);
    expect(res.body).toMatchObject({
      subtotalCents: 1000,
      taxCents: 138,
      totalCents: 1000,
    });
  });

  it('charges the price at sale time even if it changes later', async () => {
    await cashier().post('/sales', { items: [{ productId: 1, qty: 1 }] });
    await admin().patch('/products/1', { priceCents: 9999 }).expect(200);

    const res = await cashier().get('/sales/1').expect(200);
    expect(res.body.items[0].unitPriceCents).toBe(1000);
  });

  it('rejects an unknown or deleted product with 400', async () => {
    await admin().delete('/products/2').expect(204);
    await cashier()
      .post('/sales', { items: [{ productId: 2, qty: 1 }] })
      .expect(400);
    await cashier()
      .post('/sales', { items: [{ productId: 99, qty: 1 }] })
      .expect(400);
  });

  it.each([
    ['an empty cart', { items: [] }],
    ['a zero quantity', { items: [{ productId: 1, qty: 0 }] }],
    [
      'an unknown discount type',
      {
        items: [{ productId: 1, qty: 1 }],
        discount: { type: 'gift', value: 1 },
      },
    ],
  ])('rejects %s with 400', async (_, body) => {
    await cashier().post('/sales', body).expect(400);
  });

  it('returns the receipt with its cashier and date', async () => {
    await cashier().post('/sales', { items: [{ productId: 1, qty: 1 }] });

    const res = await cashier().get('/sales/1').expect(200);

    expect(res.body).toMatchObject({
      id: 1,
      user: { id: ctx.users.cashier.id, username: 'test-cashier' },
      items: [expect.objectContaining({ name: 'A' })],
    });
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("hides another user's sale from a cashier with 404", async () => {
    await admin().post('/sales', { items: [{ productId: 1, qty: 1 }] });
    await cashier().get('/sales/1').expect(404);
    await admin().get('/sales/1').expect(200);
  });

  it('exposes the tax rate for the checkout preview', async () => {
    const res = await cashier().get('/sales/config').expect(200);
    expect(res.body).toEqual({ taxRate: 0.16 });
  });

  it('requires authentication', async () => {
    await ctx
      .http()
      .post('/sales', { items: [{ productId: 1, qty: 1 }] })
      .expect(401);
  });
});
