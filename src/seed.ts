/**
 * Fills the database with ~90 days of synthetic store data.
 *
 *   npm run seed               # only if the catalog is empty
 *   npm run seed -- --reset    # wipes catalog, sales and adjustments first
 *   docker compose exec api node dist/seed --reset
 *
 * Deterministic (fixed PRNG seed) and consistent with the app's rules: totals
 * come from calculateTotals, stock never goes negative, and every restock or
 * shrinkage is recorded as a stock adjustment.
 */
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { Category } from './categories/category.entity.js';
import { Product } from './products/product.entity.js';
import { StockAdjustment } from './products/stock-adjustment.entity.js';
import { Sale } from './sales/sale.entity.js';
import { calculateTotals, type Discount } from './sales/totals.js';
import { Role, User } from './users/user.entity.js';

const DAYS = 90;
const CASHIERS = ['cajero1', 'cajero2'];
const CASHIER_PASSWORD = 'cajero123';
// Mexico City has no DST since 2022, so a fixed offset is exact.
const UTC_OFFSET = '-06:00';

// [name, price in pesos (tax included)]
const CATALOG: Record<string, [string, number][]> = {
  Bebidas: [
    ['Coca-Cola 600 ml', 18.5],
    ['Pepsi 600 ml', 17],
    ['Agua natural 1 L', 14],
    ['Jugo de naranja 1 L', 28],
    ['Cerveza clara 355 ml', 24],
    ['Bebida energética 250 ml', 39],
    ['Café frío 281 ml', 32],
  ],
  Botanas: [
    ['Papas sal 45 g', 19],
    ['Totopos nacho 62 g', 21],
    ['Frituras de queso 52 g', 17],
    ['Rollitos picantes 70 g', 22],
    ['Cacahuates japoneses 100 g', 18],
    ['Palomitas 80 g', 25],
  ],
  Dulces: [
    ['Pastelito relleno', 17],
    ['Chocolate con leche', 14],
    ['Mazapán', 6],
    ['Tamarindo enchilado', 5],
    ['Chicles menta', 15],
    ['Paleta de malvavisco', 16],
  ],
  Panadería: [
    ['Pan blanco grande', 52],
    ['Roles de canela', 18],
    ['Mantecadas 4 pzas', 26],
    ['Tortillas 1 kg', 24],
    ['Donas 6 pzas', 28],
  ],
  Lácteos: [
    ['Leche entera 1 L', 29],
    ['Yogurt natural 1 kg', 45],
    ['Queso panela 400 g', 72],
    ['Huevo 12 pzas', 48],
    ['Mantequilla 90 g', 30],
  ],
  Abarrotes: [
    ['Arroz 1 kg', 32],
    ['Frijol negro 1 kg', 38],
    ['Aceite vegetal 1 L', 46],
    ['Atún en lata 140 g', 22],
    ['Sopa instantánea', 14],
    ['Azúcar 1 kg', 30],
  ],
  Limpieza: [
    ['Jabón de lavandería', 18],
    ['Papel higiénico 4 rollos', 38],
    ['Detergente 1 kg', 42],
    ['Cloro 1 L', 22],
  ],
};

/** mulberry32: tiny seeded PRNG so every run produces the same data. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(42);
const int = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: T[]) => items[int(0, items.length - 1)];

/** Local store date (YYYY-MM-DD) `daysAgo` days before today. */
function localDay(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}
const at = (day: string, minutes: number) =>
  new Date(
    `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00${UTC_OFFSET}`,
  );

async function main() {
  const reset = process.argv.includes('--reset');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);

  const summary = await dataSource.transaction(async (em) => {
    if (reset) {
      await em.query(
        'TRUNCATE sale_items, sales, stock_adjustments, products, categories RESTART IDENTITY CASCADE',
      );
    } else if (await em.count(Product)) {
      throw new Error(
        'The catalog already has products. Run with --reset to replace all catalog, sales and stock data.',
      );
    }

    // Users: the admin is seeded on bootstrap; add cashiers if missing.
    const admin = await em.findOneByOrFail(User, { role: Role.Admin });
    const cashiers: User[] = [];
    for (const username of CASHIERS) {
      cashiers.push(
        (await em.findOneBy(User, { username })) ??
          (await em.save(
            em.create(User, {
              username,
              passwordHash: await hash(CASHIER_PASSWORD, 10),
              role: Role.Cashier,
            }),
          )),
      );
    }

    // Catalog. Popularity drives how often a product is picked.
    const products: (Product & { popularity: number; restockTo: number })[] =
      [];
    for (const [categoryName, items] of Object.entries(CATALOG)) {
      const category = await em.save(
        em.create(Category, { name: categoryName }),
      );
      const prefix = categoryName
        .normalize('NFD')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase();
      for (const [i, [name, pesos]] of items.entries()) {
        const minStock = int(5, 15);
        const restockTo = minStock * int(4, 6);
        const product = await em.save(
          em.create(Product, {
            name,
            sku: `${prefix}-${String(i + 1).padStart(3, '0')}`,
            priceCents: Math.round(pesos * 100),
            stock: restockTo,
            minStock,
            categoryId: category.id,
          }),
        );
        products.push(
          Object.assign(product, { popularity: int(1, 10), restockTo }),
        );
      }
    }
    const weighted = products.flatMap((p) => Array(p.popularity).fill(p));
    // Some products stop being restocked near the end, so low-stock alerts show.
    const neglected = new Set(
      products.filter((_, i) => i % 6 === 0).map((p) => p.id),
    );

    const sales: Sale[] = [];
    const adjustments: Partial<StockAdjustment>[] = [];
    const taxRate = Number(app.get(ConfigService).getOrThrow('TAX_RATE'));
    const now = Date.now();

    for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
      const day = localDay(daysAgo);

      // 07:30 — restock anything at or below its minimum.
      for (const p of products) {
        if (p.stock > p.minStock) continue;
        if (daysAgo < 7 && neglected.has(p.id)) continue;
        const delta = p.restockTo - p.stock;
        p.stock += delta;
        adjustments.push({
          productId: p.id,
          userId: admin.id,
          delta,
          reason: 'Compra a proveedor',
          createdAt: at(day, 7 * 60 + 30),
        });
      }
      // Occasional shrinkage.
      if (random() < 0.15) {
        const p = pick(products);
        const loss = Math.min(p.stock, int(1, 2));
        if (loss > 0) {
          p.stock -= loss;
          adjustments.push({
            productId: p.id,
            userId: admin.id,
            delta: -loss,
            reason: pick(['Merma', 'Producto dañado', 'Caducado']),
            createdAt: at(day, 21 * 60 + 15),
          });
        }
      }

      // 08:00–21:00 — busier on weekends.
      const weekday = at(day, 12 * 60).getUTCDay();
      const busy = weekday === 0 || weekday === 6 ? 1.4 : 1;
      const count = Math.round(int(12, 26) * busy);
      const times = Array.from({ length: count }, () =>
        int(8 * 60, 21 * 60 - 1),
      ).sort((a, b) => a - b);

      for (const minutes of times) {
        const createdAt = at(day, minutes);
        if (createdAt.getTime() > now) break;

        const lines = new Map<(typeof products)[number], number>();
        for (let n = int(1, 4); n > 0; n--) {
          const p = pick(weighted);
          const qty = (lines.get(p) ?? 0) + (random() < 0.25 ? int(2, 3) : 1);
          if (qty <= p.stock) lines.set(p, qty);
        }
        if (lines.size === 0) continue;

        const items = [...lines].map(([p, qty]) => {
          p.stock -= qty;
          return {
            productId: p.id,
            name: p.name,
            qty,
            unitPriceCents: p.priceCents,
          };
        });
        const roll = random();
        const discount: Discount | undefined =
          roll < 0.06
            ? { type: 'percent', value: pick([5, 10]) }
            : roll < 0.09
              ? { type: 'amount', value: 1000 }
              : undefined;

        sales.push(
          em.create(Sale, {
            userId: random() < 0.1 ? admin.id : pick(cashiers).id,
            ...calculateTotals(items, discount, taxRate),
            createdAt,
            items,
          }),
        );
      }
    }

    await em.save(Sale, sales, { chunk: 200 });
    await em.insert(StockAdjustment, adjustments);
    for (const p of products)
      await em.update(Product, p.id, { stock: p.stock });

    return {
      categories: Object.keys(CATALOG).length,
      products: products.length,
      sales: sales.length,
      adjustments: adjustments.length,
      lowStock: products.filter((p) => p.stock <= p.minStock).length,
      from: localDay(DAYS - 1),
      to: localDay(0),
    };
  });

  await app.close();
  console.table(summary);
  console.log(
    `Cashiers: ${CASHIERS.join(', ')} (password: ${CASHIER_PASSWORD})`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
