// Response contracts of the API: the shapes web/src relies on. Compared with
// toEqual, so a removed, renamed or retyped field fails (a breaking change)
// and an added one has to be added here on purpose.

const Int = expect.toSatisfy(Number.isInteger, 'an integer');
const Str = expect.any(String);
const Bool = expect.any(Boolean);
const IsoDate = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
);
const Role = expect.toSatisfy(
  (r) => r === 'admin' || r === 'cashier',
  'admin or cashier',
);

export const User = { id: Int, username: Str, role: Role, active: Bool };

export const Category = { id: Int, name: Str };

/** As returned by writes (POST/PATCH, stock adjustments): no relations. */
export const ProductRow = {
  id: Int,
  name: Str,
  sku: Str,
  priceCents: Int,
  stock: Int,
  minStock: Int,
  categoryId: Int,
  active: Bool,
};

/** As returned by reads (GET /products, GET /products/:id). */
export const Product = { ...ProductRow, category: Category };

export const StockAdjustment = {
  id: Int,
  productId: Int,
  userId: Int,
  delta: Int,
  reason: Str,
  createdAt: IsoDate,
  user: User,
};

const SaleRow = {
  id: Int,
  userId: Int,
  subtotalCents: Int,
  discountCents: Int,
  taxCents: Int,
  totalCents: Int,
  createdAt: IsoDate,
  user: User,
};

export const SaleItem = {
  id: Int,
  saleId: Int,
  productId: Int,
  name: Str,
  qty: Int,
  unitPriceCents: Int,
};

/** A receipt: POST /sales and GET /sales/:id. */
export const Sale = {
  ...SaleRow,
  items: expect.toSatisfy(
    (items) => Array.isArray(items) && items.length > 0,
    'a non-empty array',
  ),
};

/** A page of GET /sales: rows without their items. */
export const SalesPage = { data: expect.any(Array), total: Int };
export const SalesPageRow = SaleRow;

export const Login = {
  access_token: Str,
  user: { id: Int, username: Str, role: Role },
};

export const Me = { sub: Int, username: Str, role: Role, iat: Int, exp: Int };

export const SalesConfig = { taxRate: expect.any(Number) };

export const SummaryRow = {
  period: expect.stringMatching(/^\d{4}-\d{2}(-\d{2})?$/),
  salesCount: Int,
  totalCents: Int,
};

export const TopProduct = {
  productId: Int,
  name: Str,
  qty: Int,
  totalCents: Int,
};

/** Nest's error body; `error` is absent on bare exceptions like `new UnauthorizedException()`. */
export const httpError = (statusCode: number, body: { error?: unknown }) => ({
  statusCode,
  message: expect.toSatisfy(
    (m) =>
      typeof m === 'string' ||
      (Array.isArray(m) && m.every((s) => typeof s === 'string')),
    'a string or string[]',
  ),
  ...('error' in body && { error: Str }),
});
