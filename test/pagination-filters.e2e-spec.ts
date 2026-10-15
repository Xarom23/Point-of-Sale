import { DataSource } from 'typeorm';
import { Sale } from './../src/sales/sale.entity.js';
import { createTestApp } from './helpers.js';

type Page = { data: { id: number; userId: number }[]; total: number };

// APP_TIMEZONE=America/Mexico_City (UTC-6); 18:00Z is noon in the store.
describe('Pagination and filters (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const admin = () => ctx.http('admin');
  const page = async (query: string, as = admin) =>
    (await as().get(`/sales?${query}`).expect(200)).body as Page;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());

  describe('GET /sales', () => {
    const SALES = 45;
    const TIED = 20; // share one createdAt, so only the id breaks the tie

    beforeEach(async () => {
      await ctx.resetCatalog(0);
      const totals = {
        subtotalCents: 1000,
        discountCents: 0,
        taxCents: 138,
        totalCents: 1000,
      };
      await ctx.app
        .get(DataSource)
        .getRepository(Sale)
        .insert(
          Array.from({ length: SALES }, (_, i) => ({
            ...totals,
            // every third sale is the cashier's: 15 of 45
            userId: i % 3 === 0 ? ctx.users.cashier.id : ctx.users.admin.id,
            createdAt: new Date(
              i < TIED
                ? '2026-03-10T18:00:00Z'
                : `2026-03-${String(i - TIED + 1).padStart(2, '0')}T18:00:00Z`,
            ),
          })),
        );
    });

    /** Fetches every page of `query` with page size `limit`. */
    const walk = async (limit: number, query = '', as = admin) => {
      const pages: Page[] = [];
      for (let p = 1; ; p++) {
        const body = await page(`${query}&limit=${limit}&page=${p}`, as);
        if (!body.data.length) return pages;
        pages.push(body);
      }
    };
    const idsOf = (pages: Page[]) =>
      pages.flatMap((p) => p.data.map((s) => s.id));

    it('walks every page without duplicates or gaps, ties included', async () => {
      const pages = await walk(20);
      const ids = idsOf(pages);

      expect(pages.map((p) => p.data.length)).toEqual([20, 20, 5]);
      expect(pages.every((p) => p.total === SALES)).toBe(true);
      expect(new Set(ids).size).toBe(SALES);
      expect(ids).toEqual(idsOf([await page('limit=100')]));
    });

    it('orders the same with any page size', async () => {
      expect(idsOf(await walk(1))).toEqual(idsOf(await walk(7)));
    });

    it('returns an empty page past the end, with the total', async () => {
      expect(await page('limit=20&page=4')).toEqual({ data: [], total: SALES });
    });

    it('paginates within a date range', async () => {
      // the 20 tied sales plus the one dated March 10
      const pages = await walk(20, 'from=2026-03-10&to=2026-03-10');
      expect(pages.map((p) => p.data.length)).toEqual([20, 1]);
      expect(pages.every((p) => p.total === 21)).toBe(true);
    });

    it("paginates a cashier's own sales only", async () => {
      const cashier = () => ctx.http('cashier');
      const pages = await walk(10, '', cashier);
      expect(pages.map((p) => p.data.length)).toEqual([10, 5]);
      expect(pages.every((p) => p.total === 15)).toBe(true);
      expect(
        pages.every((p) =>
          p.data.every((s) => s.userId === ctx.users.cashier.id),
        ),
      ).toBe(true);
    });

    it('combines a cashier, a date range and a page', async () => {
      const body = await page(
        'from=2026-03-10&to=2026-03-10&limit=5&page=2',
        () => ctx.http('cashier'),
      );
      expect(body.total).toBe(7); // tied sales 0,3,…,18
      expect(body.data).toHaveLength(2);
    });

    it('returns nothing when from is after to', async () => {
      expect(await page('from=2026-03-20&to=2026-03-01')).toEqual({
        data: [],
        total: 0,
      });
    });

    it('ignores unknown parameters', async () => {
      expect(await page('foo=bar&sort=id')).toEqual(await page(''));
    });

    it.each([
      'page=0',
      'page=-1',
      'page=1.5',
      'page=abc',
      'page=',
      'page=1e20',
      'page=1&page=2',
      'limit=0',
      'limit=-5',
      'limit=',
      'from=',
      'to=2026-02-30',
    ])('rejects %s with 400', async (query) => {
      await admin().get(`/sales?${query}`).expect(400);
    });
  });

  describe('GET /products', () => {
    const names = async (query: string) =>
      (
        (await ctx.http('cashier').get(`/products?${query}`).expect(200))
          .body as {
          name: string;
        }[]
      ).map((p) => p.name);

    beforeEach(async () => {
      await ctx.resetCatalog(0);
      const add = async (
        name: string,
        sku: string,
        stock: number,
        minStock: number,
      ) =>
        (
          await admin()
            .post('/products', {
              name,
              sku,
              stock,
              minStock,
              priceCents: 100,
              categoryId: 1,
            })
            .expect(201)
        ).body as { id: number };
      await add('Agua 100%', 'AGU_1', 2, 5); // low
      await add('Agua natural', 'AGU-2', 50, 5);
      await add('Refresco', 'REF-1', 1, 3); // low
      await add('Jugo', 'JUG-1', 0, 0); // low: at its minimum
      const gone = await add('Agua vieja', 'AGU-3', 0, 5); // low, but deleted
      await admin().delete(`/products/${gone.id}`).expect(204);
    });

    it.each([
      ['', ['Agua 100%', 'Agua natural', 'Jugo', 'Refresco']],
      ['q=', ['Agua 100%', 'Agua natural', 'Jugo', 'Refresco']],
      ['q=agua', ['Agua 100%', 'Agua natural']],
      ['q=AGU-', ['Agua natural']],
      ['q=zzz', []],
      ['lowStock=true', ['Agua 100%', 'Jugo', 'Refresco']],
      ['lowStock=false', ['Agua 100%', 'Agua natural', 'Jugo', 'Refresco']],
      ['q=agua&lowStock=true', ['Agua 100%']],
      ['q=ref&lowStock=true', ['Refresco']],
      ['q=natural&lowStock=true', []],
      ['q=%25', ['Agua 100%']], // a literal %
      ['q=_', ['Agua 100%']], // a literal _ (in its SKU)
      ['q=%5C', []], // a lone backslash
    ])('?%s returns active matches sorted by name', async (query, expected) => {
      expect(await names(query)).toEqual(expected);
    });

    it.each(['lowStock=yes', 'lowStock=1', 'lowStock=TRUE', 'q=a&q=b'])(
      'rejects %s with 400',
      async (query) => {
        await ctx.http('cashier').get(`/products?${query}`).expect(400);
      },
    );

    it('returns a large catalog whole and sorted', async () => {
      await ctx.resetCatalog(120);
      const list = await names('');
      expect(list).toHaveLength(120);
      expect(list).toEqual([...list].sort());
    });
  });

  describe('GET /reports', () => {
    beforeEach(async () => {
      await ctx.resetCatalog(2, { stock: 100 });
      const ds = ctx.app.get(DataSource);
      for (const [createdAt, productId] of [
        ['2026-01-31T18:00:00Z', 1],
        ['2026-02-01T18:00:00Z', 2],
        ['2026-03-01T18:00:00Z', 2],
      ] as const) {
        const { body } = await admin()
          .post('/sales', { items: [{ productId, qty: 1 }] })
          .expect(201);
        await ds.query(`UPDATE sales SET "createdAt" = $1 WHERE id = $2`, [
          createdAt,
          body.id,
        ]);
      }
    });

    it('groups by month within a range', async () => {
      const res = await admin()
        .get('/reports/summary?groupBy=month&from=2026-02-01&to=2026-03-31')
        .expect(200);
      expect(res.body.map((r: { period: string }) => r.period)).toEqual([
        '2026-02',
        '2026-03',
      ]);
    });

    it.each(['/reports/summary', '/reports/top-products'])(
      '%s returns nothing when from is after to',
      async (url) => {
        const res = await admin()
          .get(`${url}?from=2026-03-01&to=2026-01-01`)
          .expect(200);
        expect(res.body).toEqual([]);
      },
    );

    it('ranks within a range', async () => {
      const res = await admin()
        .get('/reports/top-products?from=2026-02-01&to=2026-02-28')
        .expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({ productId: 2, qty: 1 }),
      ]);
    });

    it.each([
      ['limit=1', 200],
      ['limit=50', 200],
      ['limit=0', 400],
      ['limit=51', 400],
      ['limit=abc', 400],
    ])('top-products ?%s answers %i', async (query, status) => {
      await admin().get(`/reports/top-products?${query}`).expect(status);
    });

    it.each(['groupBy=', 'groupBy=DAY', 'from=2026-1-1', 'to=yesterday'])(
      'summary rejects %s with 400',
      async (query) => {
        await admin().get(`/reports/summary?${query}`).expect(400);
      },
    );
  });
});
