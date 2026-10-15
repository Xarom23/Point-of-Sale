import request from 'supertest';
import { createTestApp } from './helpers.js';

const INT_MAX = 2 ** 31 - 1; // Postgres int4

type FieldType = 'string' | 'int' | 'enum';
const WRONG_TYPES: Record<FieldType, unknown[]> = {
  string: [123, true, ['a'], { a: 1 }],
  int: ['100', true, [1], { a: 1 }, 1.5],
  enum: [1, true, ['admin'], { a: 1 }, 'superadmin'],
};

// A valid body per DTO and the type of each field.
const DTOS = {
  'POST /categories': {
    url: '/categories',
    body: { name: 'Bebidas' },
    fields: { name: 'string' },
  },
  'POST /products': {
    url: '/products',
    body: {
      name: 'Agua',
      sku: 'AGU-1',
      priceCents: 1500,
      stock: 5,
      minStock: 1,
      categoryId: 1,
    },
    fields: {
      name: 'string',
      sku: 'string',
      priceCents: 'int',
      stock: 'int',
      minStock: 'int',
      categoryId: 'int',
    },
  },
  'POST /users': {
    url: '/users',
    body: { username: 'ana', password: 'secreta123', role: 'cashier' },
    fields: { username: 'string', password: 'string', role: 'enum' },
  },
  'POST /products/:id/stock-adjustments': {
    url: '/products/1/stock-adjustments',
    body: { delta: 1, reason: 'Compra' },
    fields: { delta: 'int', reason: 'string' },
  },
} satisfies Record<
  string,
  { url: string; body: object; fields: Record<string, FieldType> }
>;

/** [dto, field, label, body] for a missing, null and wrongly typed field. */
const badBodies = Object.entries(DTOS).flatMap(([dto, { body, fields }]) =>
  Object.entries(fields).flatMap(([field, type]) => {
    const { [field]: _, ...without } = body as Record<string, unknown>;
    return [
      [dto, field, 'missing', without],
      [dto, field, 'null', { ...body, [field]: null }],
      ...WRONG_TYPES[type].map((value) => [
        dto,
        field,
        JSON.stringify(value),
        { ...body, [field]: value },
      ]),
    ] as [string, string, string, object][];
  }),
);

describe('Input validation and hostile input (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let adminToken: string;
  const admin = () => ctx.http('admin');
  const post = (dto: keyof typeof DTOS, patch: object) =>
    admin().post(DTOS[dto].url, { ...DTOS[dto].body, ...patch });
  /** Sends a raw string, for bodies JSON.stringify can't produce. */
  const raw = (url: string, body: string, type = 'application/json') =>
    request(ctx.app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', type)
      .send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    adminToken = await ctx.sign(ctx.users.admin);
  });
  beforeEach(async () => {
    await ctx.resetCatalog(1, { stock: 1000 });
    await ctx.resetUsers();
  });
  afterAll(() => ctx.app.close());

  describe('missing, null and wrongly typed fields', () => {
    it.each(badBodies)(
      '%s rejects %s %s with 400',
      async (dto, _field, _label, body) => {
        await admin()
          .post(DTOS[dto as keyof typeof DTOS].url, body)
          .expect(400);
      },
    );

    it.each([
      ['an empty body', {}],
      ['a missing items array', { discount: { type: 'amount', value: 1 } }],
      ['items as an object', { items: { productId: 1, qty: 1 } }],
      ['an item without qty', { items: [{ productId: 1 }] }],
      ['a string qty', { items: [{ productId: 1, qty: '1' }] }],
      ['a null item', { items: [null] }],
      [
        'a discount without type',
        { items: [{ productId: 1, qty: 1 }], discount: { value: 1 } },
      ],
      [
        'an unknown discount type',
        {
          items: [{ productId: 1, qty: 1 }],
          discount: { type: 'gift', value: 1 },
        },
      ],
      [
        'a fractional discount',
        {
          items: [{ productId: 1, qty: 1 }],
          discount: { type: 'amount', value: 1.5 },
        },
      ],
    ])('POST /sales rejects %s with 400', async (_, body) => {
      await admin().post('/sales', body).expect(400);
    });

    it.each([
      ['an empty body', {}],
      ['a numeric username', { username: 1, password: 'x' }],
      ['an array password', { username: 'login-a', password: ['x'] }],
      ['a null password', { username: 'login-b', password: null }],
      ['an empty username', { username: '', password: 'x' }],
    ])('POST /auth/login rejects %s with 400', async (_, body) => {
      await ctx.http().post('/auth/login', body).expect(400);
    });
  });

  describe('boundary values', () => {
    it.each([
      ['POST /categories', { name: 'x'.repeat(100) }, 201],
      ['POST /categories', { name: 'x'.repeat(101) }, 400],
      ['POST /categories', { name: '' }, 400],
      ['POST /products', { name: 'x'.repeat(150) }, 201],
      ['POST /products', { name: 'x'.repeat(151) }, 400],
      ['POST /products', { sku: 'x'.repeat(50) }, 201],
      ['POST /products', { sku: 'x'.repeat(51) }, 400],
      ['POST /products', { priceCents: 0, stock: 0, minStock: 0 }, 201],
      ['POST /products', { priceCents: -1 }, 400],
      ['POST /products', { stock: -1 }, 400],
      ['POST /products', { minStock: -1 }, 400],
      ['POST /products', { priceCents: INT_MAX, stock: INT_MAX }, 201],
      ['POST /products', { priceCents: INT_MAX + 1 }, 400],
      ['POST /products', { stock: INT_MAX + 1 }, 400],
      ['POST /products', { minStock: INT_MAX + 1 }, 400],
      ['POST /products', { categoryId: 0 }, 400],
      ['POST /products', { categoryId: INT_MAX + 1 }, 400],
      ['POST /products', { priceCents: Number.MAX_SAFE_INTEGER }, 400],
      ['POST /users', { username: 'x'.repeat(50) }, 201],
      ['POST /users', { username: 'x'.repeat(51) }, 400],
      ['POST /users', { password: 'x'.repeat(7) }, 400],
      ['POST /users', { password: 'x'.repeat(8) }, 201],
      ['POST /users', { password: 'x'.repeat(72) }, 201],
      ['POST /users', { password: 'x'.repeat(73) }, 400],
      ['POST /products/:id/stock-adjustments', { delta: 0 }, 400],
      ['POST /products/:id/stock-adjustments', { delta: -1000 }, 201],
      ['POST /products/:id/stock-adjustments', { delta: -1001 }, 409],
      ['POST /products/:id/stock-adjustments', { delta: INT_MAX }, 400],
      [
        'POST /products/:id/stock-adjustments',
        { reason: 'x'.repeat(200) },
        201,
      ],
      [
        'POST /products/:id/stock-adjustments',
        { reason: 'x'.repeat(201) },
        400,
      ],
    ] as [keyof typeof DTOS, object, number][])(
      '%s with %j answers %i',
      async (dto, patch, status) => {
        await post(dto, patch).expect(status);
      },
    );

    const sale = (patch: object) =>
      admin().post('/sales', { items: [{ productId: 1, qty: 1 }], ...patch });

    it.each([
      [{ items: [{ productId: 1, qty: 0 }] }, 400],
      [{ items: [{ productId: 0, qty: 1 }] }, 400],
      [{ items: [{ productId: 1, qty: INT_MAX }] }, 409],
      [{ items: [{ productId: INT_MAX + 1, qty: 1 }] }, 400],
      [{ discount: { type: 'percent', value: 0 } }, 201],
      [{ discount: { type: 'percent', value: 100 } }, 201],
      [{ discount: { type: 'percent', value: 101 } }, 400],
      [{ discount: { type: 'amount', value: -1 } }, 400],
      [{ discount: { type: 'amount', value: INT_MAX } }, 201],
    ])('POST /sales with %j answers %i', async (patch, status) => {
      await sale(patch).expect(status);
    });

    it('caps a 100% discount at a zero total', async () => {
      const res = await sale({ discount: { type: 'percent', value: 100 } });
      expect(res.body).toMatchObject({ totalCents: 0, taxCents: 0 });
    });

    it.each([
      ['/products/abc', 400],
      ['/products/1.5', 400],
      ['/products/-1', 404],
      ['/products/2147483648', 400],
      ['/products/99999999999999999999', 400],
      ['/sales/2147483648', 400],
      ['/products/2147483648/stock-adjustments', 400],
    ])('GET %s answers %i', async (url, status) => {
      await admin().get(url).expect(status);
    });
  });

  describe('unexpected but valid input', () => {
    it.each([
      ['accents and ñ', 'Café de olla ñandú'],
      ['emoji', 'Cerveza 🍺🇲🇽'],
      ['quotes', `Galletas "María" d'Or`],
      ['right-to-left text', 'مرحبا'],
      ['150 characters with ñ', 'ñ'.repeat(150)],
      ['150 emoji (one character each)', '🍺'.repeat(150)],
    ])('stores %s verbatim', async (_, name) => {
      const res = await post('POST /products', { name }).expect(201);
      const read = await admin().get(`/products/${res.body.id}`).expect(200);
      expect(read.body.name).toBe(name);
    });

    it('rejects 151 emoji like any 151-character name', () =>
      post('POST /products', { name: '🍺'.repeat(151) }).expect(400));

    it('answers an over-long search with an empty list', async () => {
      const res = await admin()
        .get(`/products?q=${'z'.repeat(8_000)}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('null bytes', () => {
    it.each([
      ['a category name', () => admin().post('/categories', { name: 'a\0b' })],
      ['a product SKU', () => post('POST /products', { sku: 'A\0' })],
      [
        'a stock reason',
        () => post('POST /products/:id/stock-adjustments', { reason: '\0' }),
      ],
      ['a search', () => admin().get('/products?q=a%00b')],
      ['a path id', () => admin().get('/products/1%00')],
      [
        'a username at login',
        () =>
          ctx.http().post('/auth/login', { username: 'a\0', password: 'x' }),
      ],
    ])('in %s are rejected with 400', async (_, send) => {
      await send().expect(400);
    });
  });

  describe('SQL injection', () => {
    const payloads = [
      `'; DROP TABLE products; --`,
      `' OR '1'='1`,
      `1; DELETE FROM users`,
      `%' UNION SELECT "passwordHash" FROM users --`,
    ];

    it.each(payloads)('stores "%s" as plain text', async (name) => {
      const res = await admin().post('/categories', { name }).expect(201);
      expect(res.body.name).toBe(name);
      await admin().get('/products/1').expect(200); // tables intact
      expect((await admin().get('/users').expect(200)).body.length).toBe(2);
    });

    it.each(payloads)('searches "%s" literally', async (q) => {
      const res = await admin()
        .get(`/products?q=${encodeURIComponent(q)}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it.each([
      `/products/${encodeURIComponent('1 OR 1=1')}`,
      `/sales/${encodeURIComponent('1;DROP TABLE sales')}`,
      `/sales?from=${encodeURIComponent("2026-01-01' OR '1'='1")}`,
      `/reports/summary?groupBy=${encodeURIComponent('day; DROP TABLE sales')}`,
      `/reports/top-products?limit=${encodeURIComponent('10; DROP TABLE sales')}`,
    ])('rejects %s with 400', async (url) => {
      await admin().get(url).expect(400);
    });

    it.each([`admin' --`, `' OR '1'='1' --`])(
      'does not log in as "%s"',
      async (username) => {
        await ctx
          .http()
          .post('/auth/login', { username, password: `' OR '1'='1` })
          .expect(401);
      },
    );
  });

  describe('cross-site scripting', () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
    ];

    it.each(payloads)(
      'returns "%s" untouched, as JSON (React escapes it on render)',
      async (name) => {
        const res = await post('POST /products', { name }).expect(201);
        const read = await admin().get('/products').expect(200);
        expect(read.headers['content-type']).toMatch(/^application\/json/);
        expect(
          read.body.find((p: { id: number }) => p.id === res.body.id).name,
        ).toBe(name);
      },
    );

    it('answers an unknown route carrying a script as JSON', async () => {
      const res = await admin()
        .get(`/${encodeURIComponent('<script>alert(1)</script>')}`)
        .expect(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
    });

    it('does not echo the offending value in validation errors', async () => {
      const res = await admin()
        .post('/categories', { name: `<script>${'x'.repeat(100)}</script>` })
        .expect(400);
      expect(JSON.stringify(res.body)).not.toContain('<script>');
    });
  });

  describe('mass assignment', () => {
    it('ignores id and active when creating a product', async () => {
      const res = await post('POST /products', {
        id: 999,
        active: false,
      }).expect(201);
      expect(res.body).toMatchObject({ id: 2, active: true });
    });

    it('ignores stock, active and id when updating a product', async () => {
      const res = await admin()
        .patch('/products/1', {
          name: 'Renamed',
          stock: 1,
          active: false,
          id: 7,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id: 1,
        name: 'Renamed',
        stock: 1000,
        active: true,
      });
    });

    it('ignores passwordHash and id when creating a user', async () => {
      const res = await post('POST /users', {
        passwordHash: 'x',
        id: 999,
      }).expect(201);
      expect(res.body.id).not.toBe(999);
      await ctx
        .http()
        .post('/auth/login', { username: 'ana', password: 'secreta123' })
        .expect(200);
    });

    it('ignores passwordHash when updating a user', async () => {
      const { body } = await post('POST /users', {}).expect(201);
      await admin()
        .patch(`/users/${body.id}`, { passwordHash: 'x' })
        .expect(200);
      await ctx
        .http()
        .post('/auth/login', { username: 'ana', password: 'secreta123' })
        .expect(200);
    });

    it('records a stock adjustment for the path product and the caller', async () => {
      await post('POST /products/:id/stock-adjustments', {
        productId: 2,
        userId: ctx.users.cashier.id,
      }).expect(201);
      const [entry] = (
        await admin().get('/products/1/stock-adjustments').expect(200)
      ).body;
      expect(entry).toMatchObject({ productId: 1, userId: ctx.users.admin.id });
    });

    it('does not pollute Object.prototype through __proto__', async () => {
      await raw(
        '/categories',
        '{"name":"P","__proto__":{"polluted":true}}',
      ).expect(201);
      await raw(
        '/users',
        '{"username":"proto","password":"secreta123","role":"cashier","__proto__":{"role":"admin"},"constructor":{"prototype":{"polluted":true}}}',
      ).expect(201);

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      const users = (await admin().get('/users').expect(200)).body;
      expect(
        users.find((u: { username: string }) => u.username === 'proto').role,
      ).toBe('cashier');
    });
  });

  describe('oversized and malformed payloads', () => {
    it('rejects a body over 100 KB with 413', () =>
      admin()
        .post('/sales', {
          items: Array.from({ length: 5000 }, () => ({ productId: 1, qty: 1 })),
        })
        .expect(413));

    it('accepts a cart of 200 lines', () =>
      admin()
        .post('/sales', {
          items: Array.from({ length: 200 }, () => ({ productId: 1, qty: 1 })),
        })
        .expect(201));

    it('rejects a cart of 201 lines with 400', () =>
      admin()
        .post('/sales', {
          items: Array.from({ length: 201 }, () => ({ productId: 1, qty: 1 })),
        })
        .expect(400));

    it('rejects malformed JSON with 400', () =>
      raw('/categories', '{"name":').expect(400));

    it('does not parse JSON sent as text/plain', () =>
      raw('/categories', '{"name":"Texto"}', 'text/plain').expect(400));
  });

  describe('bursts', () => {
    it('serves 100 concurrent reads', async () => {
      const responses = await Promise.all(
        Array.from({ length: 100 }, () => ctx.http('cashier').get('/products')),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(100).fill(200));
    });

    it('rejects 50 concurrent invalid writes cleanly and keeps serving', async () => {
      const responses = await Promise.all(
        Array.from({ length: 50 }, () =>
          admin().post('/products', { name: 1 }),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(50).fill(400));
      await admin().get('/products').expect(200);
    });
  });
});
