import { ConfigService } from '@nestjs/config';
import * as C from './contracts.js';
import { createTestApp } from './helpers.js';

/** Every element matches `shape`, and there is at least one to check. */
const listOf = (list: unknown[], shape: object) => {
  expect(list).not.toHaveLength(0);
  expect(list).toEqual(list.map(() => shape));
};

describe('API contracts (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.resetCatalog(1);
    await ctx.resetUsers();
  });
  afterAll(() => ctx.app.close());

  describe('auth', () => {
    it('POST /auth/login', async () => {
      const config = ctx.app.get(ConfigService);
      const res = await ctx
        .http()
        .post('/auth/login', {
          username: config.getOrThrow('ADMIN_USERNAME'),
          password: config.getOrThrow('ADMIN_PASSWORD'),
        })
        .expect(200);
      expect(res.body).toEqual(C.Login);
    });

    it('GET /auth/me', async () => {
      const res = await admin().get('/auth/me').expect(200);
      expect(res.body).toEqual(C.Me);
    });
  });

  describe('categories', () => {
    it('GET /categories', async () => {
      listOf((await admin().get('/categories').expect(200)).body, C.Category);
    });

    it('POST and PATCH /categories', async () => {
      const created = await admin()
        .post('/categories', { name: 'X' })
        .expect(201);
      expect(created.body).toEqual(C.Category);
      const updated = await admin()
        .patch(`/categories/${created.body.id}`, { name: 'Y' })
        .expect(200);
      expect(updated.body).toEqual(C.Category);
    });
  });

  describe('products', () => {
    it('GET /products and GET /products/:id include the category', async () => {
      listOf((await admin().get('/products').expect(200)).body, C.Product);
      expect((await admin().get('/products/1').expect(200)).body).toEqual(
        C.Product,
      );
    });

    it('POST and PATCH /products return the bare row', async () => {
      const created = await admin()
        .post('/products', {
          name: 'New',
          sku: 'NEW',
          priceCents: 100,
          stock: 1,
          minStock: 0,
          categoryId: 1,
        })
        .expect(201);
      expect(created.body).toEqual(C.ProductRow);
      const updated = await admin()
        .patch(`/products/${created.body.id}`, { priceCents: 200 })
        .expect(200);
      expect(updated.body).toEqual(C.ProductRow);
    });

    it('POST and GET /products/:id/stock-adjustments', async () => {
      const adjusted = await admin()
        .post('/products/1/stock-adjustments', { delta: 5, reason: 'Compra' })
        .expect(201);
      expect(adjusted.body).toEqual(C.ProductRow);
      listOf(
        (await admin().get('/products/1/stock-adjustments').expect(200)).body,
        C.StockAdjustment,
      );
    });
  });

  describe('sales', () => {
    it('POST /sales and GET /sales/:id return a receipt', async () => {
      const sold = await admin()
        .post('/sales', {
          items: [{ productId: 1, qty: 2 }],
          discount: { type: 'percent', value: 10 },
        })
        .expect(201);
      expect(sold.body).toEqual(C.Sale);
      listOf(sold.body.items, C.SaleItem);

      const receipt = await admin().get(`/sales/${sold.body.id}`).expect(200);
      expect(receipt.body).toEqual(sold.body);
    });

    it('GET /sales returns a page of rows without items', async () => {
      await admin()
        .post('/sales', { items: [{ productId: 1, qty: 1 }] })
        .expect(201);
      const res = await admin().get('/sales').expect(200);
      expect(res.body).toEqual(C.SalesPage);
      listOf(res.body.data, C.SalesPageRow);
    });

    it('GET /sales/config', async () => {
      const res = await ctx.http('cashier').get('/sales/config').expect(200);
      expect(res.body).toEqual(C.SalesConfig);
    });
  });

  describe('reports', () => {
    beforeEach(() =>
      admin()
        .post('/sales', { items: [{ productId: 1, qty: 1 }] })
        .expect(201),
    );

    it.each(['day', 'month'])('GET /reports/summary?groupBy=%s', async (by) => {
      const res = await admin()
        .get(`/reports/summary?groupBy=${by}`)
        .expect(200);
      listOf(res.body, C.SummaryRow);
    });

    it('GET /reports/top-products', async () => {
      const res = await admin().get('/reports/top-products').expect(200);
      listOf(res.body, C.TopProduct);
    });
  });

  describe('users', () => {
    it('GET /users', async () => {
      listOf((await admin().get('/users').expect(200)).body, C.User);
    });

    it('POST and PATCH /users', async () => {
      const created = await admin()
        .post('/users', {
          username: 'ana',
          password: 'secreta123',
          role: 'cashier',
        })
        .expect(201);
      expect(created.body).toEqual(C.User);
      const updated = await admin()
        .patch(`/users/${created.body.id}`, { active: false })
        .expect(200);
      expect(updated.body).toEqual(C.User);
    });
  });

  describe('errors share one envelope', () => {
    const expectError = async (
      req: PromiseLike<{ status: number; body: { error?: unknown } }>,
      status: number,
    ) => {
      const res = await req;
      expect(res.status).toBe(status);
      expect(res.body).toEqual(C.httpError(status, res.body));
    };

    it('400 validation error lists every problem', async () => {
      const res = await admin().post('/products', {}).expect(400);
      expect(res.body).toEqual(C.httpError(400, res.body));
      expect(res.body.message.length).toBeGreaterThan(1);
    });

    it('401', () => expectError(ctx.http().get('/products'), 401));
    it('403', () => expectError(ctx.http('cashier').get('/users'), 403));
    it('404', () => expectError(admin().get('/products/999'), 404));
    it('409', () =>
      expectError(admin().post('/categories', { name: 'General' }), 409));
    it('413', () =>
      expectError(
        admin().post('/categories', { name: 'x'.repeat(200_000) }),
        413,
      ));
    it('429', async () => {
      const attempt = () =>
        ctx.http().post('/auth/login', { username: 'contract', password: 'x' });
      for (let i = 0; i < 5; i++) await attempt();
      await expectError(attempt(), 429);
    });
    it('unknown route', () => expectError(admin().get('/nope'), 404));
  });
});
