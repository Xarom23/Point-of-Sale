import { DataSource } from 'typeorm';
import { createTestApp } from './helpers.js';

// APP_TIMEZONE=America/Mexico_City (UTC-6); prices include tax.
describe('Reports (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');

  const sellAt = async (
    createdAt: string,
    items: { productId: number; qty: number }[],
  ) => {
    const res = await admin().post('/sales', { items }).expect(201);
    await ctx.app
      .get(DataSource)
      .query(`UPDATE sales SET "createdAt" = $1 WHERE id = $2`, [
        createdAt,
        res.body.id,
      ]);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.truncate('sale_items', 'sales', 'products', 'categories');
    await admin().post('/categories', { name: 'General' }).expect(201);
    const base = { stock: 100, minStock: 0, categoryId: 1 };
    await admin().post('/products', {
      ...base,
      name: 'A',
      sku: 'A',
      priceCents: 1000,
    });
    await admin().post('/products', {
      ...base,
      name: 'B',
      sku: 'B',
      priceCents: 2500,
    });

    await sellAt('2026-01-15T16:00:00Z', [{ productId: 1, qty: 2 }]); // 2000
    // 02:00 UTC on Jan 16 is Jan 15 in Mexico City.
    await sellAt('2026-01-16T02:00:00Z', [{ productId: 2, qty: 1 }]); // 2500
    await sellAt('2026-01-20T18:00:00Z', [
      { productId: 1, qty: 1 },
      { productId: 2, qty: 3 },
    ]); // 8500
    await sellAt('2026-02-01T18:00:00Z', [{ productId: 1, qty: 5 }]); // 5000
  });
  afterAll(() => ctx.app.close());

  describe('GET /reports/summary', () => {
    it('groups sales by local day within a range', async () => {
      const res = await admin()
        .get('/reports/summary?from=2026-01-01&to=2026-01-31&groupBy=day')
        .expect(200);
      expect(res.body).toEqual([
        { period: '2026-01-15', salesCount: 2, totalCents: 4500 },
        { period: '2026-01-20', salesCount: 1, totalCents: 8500 },
      ]);
    });

    it('groups sales by month', async () => {
      const res = await admin()
        .get('/reports/summary?groupBy=month')
        .expect(200);
      expect(res.body).toEqual([
        { period: '2026-01', salesCount: 3, totalCents: 13000 },
        { period: '2026-02', salesCount: 1, totalCents: 5000 },
      ]);
    });

    it('rejects an unknown grouping with 400', async () => {
      await admin().get('/reports/summary?groupBy=week').expect(400);
    });
  });

  describe('GET /reports/top-products', () => {
    it('ranks products by units sold within a range', async () => {
      const res = await admin()
        .get('/reports/top-products?from=2026-01-01&to=2026-01-31')
        .expect(200);
      expect(res.body).toEqual([
        { productId: 2, name: 'B', qty: 4, totalCents: 10000 },
        { productId: 1, name: 'A', qty: 3, totalCents: 3000 },
      ]);
    });

    it('limits the ranking', async () => {
      const res = await admin()
        .get('/reports/top-products?limit=1')
        .expect(200);
      expect(res.body).toEqual([
        { productId: 1, name: 'A', qty: 8, totalCents: 8000 },
      ]);
    });
  });

  it('is admin-only', async () => {
    await ctx.http('cashier').get('/reports/summary').expect(403);
    await ctx.http('cashier').get('/reports/top-products').expect(403);
  });
});
