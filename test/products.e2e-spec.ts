import { createTestApp } from './helpers.js';

const coke = {
  name: 'Coca-Cola 600ml',
  sku: 'COCA600',
  priceCents: 1850,
  stock: 10,
  minStock: 3,
  categoryId: 1,
};

describe('Products (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.truncate('products', 'categories');
    await admin().post('/categories', { name: 'Bebidas' }).expect(201);
  });
  afterAll(() => ctx.app.close());

  it('lets an admin create a product', async () => {
    const res = await admin().post('/products', coke).expect(201);
    expect(res.body).toMatchObject({ id: 1, ...coke, active: true });
  });

  it('rejects a duplicate SKU with 409', async () => {
    await admin().post('/products', coke).expect(201);
    await admin()
      .post('/products', { ...coke, name: 'Otra' })
      .expect(409);
  });

  it.each([
    ['negative price', { priceCents: -1 }],
    ['fractional cents', { priceCents: 18.5 }],
    ['negative stock', { stock: -1 }],
    ['missing name', { name: '' }],
  ])('rejects %s with 400', async (_, patch) => {
    await admin()
      .post('/products', { ...coke, ...patch })
      .expect(400);
  });

  it('rejects an unknown category with 400', () =>
    admin()
      .post('/products', { ...coke, categoryId: 99 })
      .expect(400));

  it('lists products with their category for any user', async () => {
    await admin().post('/products', coke);
    const res = await ctx.http('cashier').get('/products').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        sku: 'COCA600',
        category: { id: 1, name: 'Bebidas' },
      }),
    ]);
  });

  it('searches by name or SKU, case-insensitive', async () => {
    await admin().post('/products', coke);
    await admin().post('/products', {
      ...coke,
      name: 'Sabritas',
      sku: 'SAB45',
    });

    const byName = await admin().get('/products?q=coca').expect(200);
    const bySku = await admin().get('/products?q=sab4').expect(200);

    expect(byName.body.map((p: { sku: string }) => p.sku)).toEqual(['COCA600']);
    expect(bySku.body.map((p: { sku: string }) => p.sku)).toEqual(['SAB45']);
  });

  it('lets an admin update a product but not its stock', async () => {
    await admin().post('/products', coke);
    const res = await admin()
      .patch('/products/1', { priceCents: 1990, stock: 999 })
      .expect(200);
    expect(res.body).toMatchObject({ priceCents: 1990, stock: 10 });
  });

  it('soft-deletes: a deleted product leaves the list', async () => {
    await admin().post('/products', coke);
    await admin().delete('/products/1').expect(204);

    const res = await admin().get('/products').expect(200);
    expect(res.body).toEqual([]);
    await admin().get('/products/1').expect(404);
  });

  it('refuses to delete a category that has products with 409', async () => {
    await admin().post('/products', coke);
    await admin().delete('/categories/1').expect(409);
  });

  it('forbids a cashier from writing with 403', () =>
    ctx.http('cashier').post('/products', coke).expect(403));
});
