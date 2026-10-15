import { DataSource } from 'typeorm';
import { createTestApp } from './helpers.js';

type Row = { id: number; userId: number; user: { username: string } };
const ids = (body: { data: Row[] }) => body.data.map((s) => s.id);

// APP_TIMEZONE=America/Mexico_City (UTC-6)
describe('Sales history (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const cashier = () => ctx.http('cashier');
  const sell = (as: () => ReturnType<typeof admin>) =>
    as()
      .post('/sales', { items: [{ productId: 1, qty: 1 }] })
      .expect(201);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.truncate('sale_items', 'sales', 'products', 'categories');
    await admin().post('/categories', { name: 'General' }).expect(201);
    await admin()
      .post('/products', {
        name: 'A',
        sku: 'A',
        priceCents: 1000,
        stock: 100,
        minStock: 0,
        categoryId: 1,
      })
      .expect(201);
    await sell(admin); // #1
    await sell(cashier); // #2
    await sell(cashier); // #3
  });
  afterAll(() => ctx.app.close());

  it('shows a cashier only their own sales', async () => {
    const res = await cashier().get('/sales').expect(200);
    expect(res.body.total).toBe(2);
    expect(
      res.body.data.every((s: Row) => s.userId === ctx.users.cashier.id),
    ).toBe(true);
  });

  it('shows an admin every sale, newest first, with its cashier', async () => {
    const res = await admin().get('/sales').expect(200);
    expect(ids(res.body)).toEqual([3, 2, 1]);
    expect(res.body.data[0].user.username).toBe('test-cashier');
  });

  it('paginates', async () => {
    const res = await admin().get('/sales?limit=2&page=2').expect(200);
    expect(res.body).toMatchObject({ total: 3 });
    expect(ids(res.body)).toEqual([1]);
  });

  it('filters by date in the store timezone', async () => {
    // 02:00 UTC on Jan 16 is still Jan 15 in Mexico City.
    await ctx.app
      .get(DataSource)
      .query(
        `UPDATE sales SET "createdAt" = '2026-01-16T02:00:00Z' WHERE id = 1`,
      );

    const jan15 = await admin()
      .get('/sales?from=2026-01-15&to=2026-01-15')
      .expect(200);
    const jan16 = await admin()
      .get('/sales?from=2026-01-16&to=2026-01-16')
      .expect(200);

    expect(ids(jan15.body)).toEqual([1]);
    expect(ids(jan16.body)).toEqual([]);
  });

  it.each(['abc', '2026-13-01', '2026-02-30T10:00'])(
    'rejects the invalid date "%s" with 400',
    async (date) => {
      await admin().get(`/sales?from=${date}`).expect(400);
    },
  );

  it('rejects a page size over 100 with 400', async () => {
    await admin().get('/sales?limit=101').expect(400);
  });
});
