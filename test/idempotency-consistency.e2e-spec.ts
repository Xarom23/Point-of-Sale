import { DataSource } from 'typeorm';
import { createTestApp } from './helpers.js';

const statuses = (responses: { status: number }[]) =>
  responses.map((r) => r.status).sort((a, b) => a - b);

describe('Idempotency and consistency (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const count = async (table: string, where = 'true') =>
    Number(
      (
        await ctx.app
          .get(DataSource)
          .query(`SELECT count(*) FROM ${table} WHERE ${where}`)
      )[0].count,
    );
  const stockOf = async (id: number) =>
    (await admin().get(`/products/${id}`).expect(200)).body.stock as number;
  const parallel = <T>(n: number, send: (i: number) => PromiseLike<T>) =>
    Promise.all(Array.from({ length: n }, (_, i) => send(i)));

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.resetCatalog(1);
    await ctx.resetUsers();
  });
  afterAll(() => ctx.app.close());

  describe('repeated PATCH gives the same result', () => {
    it.each([
      ['/categories/1', { name: 'Bebidas' }, 'categories'],
      ['/products/1', { priceCents: 2000, name: 'Agua' }, 'products'],
    ])('PATCH %s twice', async (url, body, table) => {
      const first = await admin().patch(url, body).expect(200);
      const second = await admin().patch(url, body).expect(200);
      expect(second.body).toEqual(first.body);
      expect(await count(table)).toBe(1);
    });

    it('deactivating a user twice leaves it inactive', async () => {
      const { body } = await admin()
        .post('/users', {
          username: 'ana',
          password: 'secreta123',
          role: 'cashier',
        })
        .expect(201);
      await admin().patch(`/users/${body.id}`, { active: false }).expect(200);
      const again = await admin()
        .patch(`/users/${body.id}`, { active: false })
        .expect(200);
      expect(again.body.active).toBe(false);
      await ctx
        .http()
        .post('/auth/login', { username: 'ana', password: 'secreta123' })
        .expect(401);
    });
  });

  describe('repeated DELETE: 204, then 404, same final state', () => {
    it('hard-deletes a category once', async () => {
      const { body } = await admin()
        .post('/categories', { name: 'Temporal' })
        .expect(201);
      await admin().delete(`/categories/${body.id}`).expect(204);
      await admin().delete(`/categories/${body.id}`).expect(404);
      expect(await count('categories')).toBe(1);
    });

    it('soft-deletes a product once and keeps the row for history', async () => {
      await admin().delete('/products/1').expect(204);
      await admin().delete('/products/1').expect(404);
      expect(await count('products', 'NOT active')).toBe(1);
    });
  });

  describe('duplicate creation', () => {
    it.each([
      ['/categories', { name: 'General' }, 'categories'],
      [
        '/products',
        {
          name: 'Otro',
          sku: 'SKU-001',
          priceCents: 1,
          stock: 1,
          minStock: 0,
          categoryId: 1,
        },
        'products',
      ],
    ])(
      'POST %s with an existing key answers 409 and adds nothing',
      async (url, body, table) => {
        await admin().post(url, body).expect(409);
        expect(await count(table)).toBe(1);
      },
    );

    // Documented: unique keys compare exactly, as Postgres does.
    it('treats names that differ only in case as different', () =>
      admin().post('/categories', { name: 'general' }).expect(201));

    it('lets exactly one of 10 concurrent identical categories through', async () => {
      const responses = await parallel(10, () =>
        admin().post('/categories', { name: 'Snacks' }),
      );
      expect(statuses(responses)).toEqual([201, ...Array(9).fill(409)]);
      expect(await count('categories', `name = 'Snacks'`)).toBe(1);
    });

    it('lets exactly one of 5 concurrent identical users through', async () => {
      const responses = await parallel(5, () =>
        admin().post('/users', {
          username: 'dup',
          password: 'secreta123',
          role: 'cashier',
        }),
      );
      expect(statuses(responses)).toEqual([201, 409, 409, 409, 409]);
    });

    // Documented: POST /sales has no idempotency key, so a client retry is a
    // second sale. The web app never retries a checkout on its own.
    it('records a retried sale twice, consistently', async () => {
      const sale = { items: [{ productId: 1, qty: 2 }] };
      const first = await admin().post('/sales', sale).expect(201);
      const retry = await admin().post('/sales', sale).expect(201);
      expect(retry.body.id).not.toBe(first.body.id);
      expect(await stockOf(1)).toBe(6);
    });
  });

  describe('concurrency', () => {
    it('never lets parallel stock removals go below zero', async () => {
      await admin().post('/products/1/stock-adjustments', {
        delta: -5,
        reason: 'Ajuste',
      });
      const responses = await parallel(10, () =>
        admin().post('/products/1/stock-adjustments', {
          delta: -1,
          reason: 'Merma',
        }),
      );
      expect(statuses(responses)).toEqual([
        ...Array(5).fill(201),
        ...Array(5).fill(409),
      ]);
      expect(await stockOf(1)).toBe(0);
      expect(await count('stock_adjustments')).toBe(6);
    });

    it('keeps stock exact when sales and removals race for the same units', async () => {
      // stock 10; 10 sales and 10 removals of one unit each
      const responses = await parallel(20, (i) =>
        i % 2
          ? admin().post('/sales', { items: [{ productId: 1, qty: 1 }] })
          : admin().post('/products/1/stock-adjustments', {
              delta: -1,
              reason: 'Merma',
            }),
      );
      const ok = responses.filter((r) => r.status === 201).length;
      expect(ok).toBe(10);
      expect(responses.every((r) => [201, 409].includes(r.status))).toBe(true);
      expect(await stockOf(1)).toBe(0);
      expect((await count('sales')) + (await count('stock_adjustments'))).toBe(
        10,
      );
    });
  });

  describe('integrity', () => {
    it('reads back exactly what each CRUD step wrote', async () => {
      const created = await admin()
        .post('/products', {
          name: 'Café',
          sku: 'CAF-1',
          priceCents: 4500,
          stock: 3,
          minStock: 1,
          categoryId: 1,
        })
        .expect(201);
      const { id } = created.body;
      expect((await admin().get(`/products/${id}`).expect(200)).body).toEqual({
        ...created.body,
        category: { id: 1, name: 'General' },
      });

      const updated = await admin()
        .patch(`/products/${id}`, { priceCents: 5000 })
        .expect(200);
      expect(updated.body).toEqual({ ...created.body, priceCents: 5000 });
      expect(
        (await admin().get(`/products/${id}`).expect(200)).body.priceCents,
      ).toBe(5000);

      await admin().delete(`/products/${id}`).expect(204);
      await admin().get(`/products/${id}`).expect(404);
      const list = (await admin().get('/products').expect(200)).body as {
        id: number;
      }[];
      expect(list.map((p) => p.id)).not.toContain(id);
    });

    it('keeps stock = initial + adjustments - units sold, failures included', async () => {
      const initial = await stockOf(1); // 10
      const sell = (qty: number) =>
        admin().post('/sales', { items: [{ productId: 1, qty }] });
      const adjust = (delta: number) =>
        admin().post('/products/1/stock-adjustments', {
          delta,
          reason: 'Inventario',
        });

      await sell(3).expect(201);
      await adjust(10).expect(201);
      await sell(1000).expect(409);
      await sell(2).expect(201);
      await adjust(-1000).expect(409);
      await adjust(-4).expect(201);

      const adjustments = (
        await admin().get('/products/1/stock-adjustments').expect(200)
      ).body as { delta: number }[];
      const { data } = (await admin().get('/sales').expect(200)).body as {
        data: { id: number }[];
      };
      let sold = 0;
      for (const { id } of data) {
        const sale = (await admin().get(`/sales/${id}`).expect(200)).body;
        sold += sale.items.reduce(
          (n: number, i: { qty: number }) => n + i.qty,
          0,
        );
      }
      const delta = adjustments.reduce((n, a) => n + a.delta, 0);

      expect(data).toHaveLength(2);
      expect(await stockOf(1)).toBe(initial + delta - sold);
      expect(await stockOf(1)).toBe(11);
    });
  });
});

describe('Database outage (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.get(DataSource).destroy();
  });
  afterAll(() => ctx.app.close());

  it.each([
    ['an authenticated read', () => ctx.http('admin').get('/products')],
    [
      'a login',
      () => ctx.http().post('/auth/login', { username: 'x', password: 'y' }),
    ],
  ])('answers %s with a bare 500, leaking nothing', async (_, send) => {
    const res = await send().expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('keeps serving routes that do not need the database', () =>
    ctx.http().get('/').expect(200));
});
