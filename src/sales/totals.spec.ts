import { calculateTotals } from './totals.js';

const items = [
  { qty: 2, unitPriceCents: 1000 },
  { qty: 1, unitPriceCents: 2500 },
];

describe('calculateTotals', () => {
  it('breaks down the tax already included in the prices', () => {
    // 4500 / 1.16 = 3879.31 → net 3879, tax 621
    expect(calculateTotals(items, undefined, 0.16)).toEqual({
      subtotalCents: 4500,
      discountCents: 0,
      taxCents: 621,
      totalCents: 4500,
    });
  });

  it('applies a percent discount and taxes the discounted total', () => {
    // 4050 / 1.16 = 3491.38 → tax 559
    expect(
      calculateTotals(items, { type: 'percent', value: 10 }, 0.16),
    ).toEqual({
      subtotalCents: 4500,
      discountCents: 450,
      taxCents: 559,
      totalCents: 4050,
    });
  });

  it('applies a fixed discount in cents', () => {
    expect(
      calculateTotals(items, { type: 'amount', value: 500 }, 0.16),
    ).toMatchObject({ discountCents: 500, taxCents: 552, totalCents: 4000 });
  });

  it('never discounts more than the subtotal', () => {
    expect(
      calculateTotals(items, { type: 'amount', value: 99_999 }, 0.16),
    ).toMatchObject({ discountCents: 4500, taxCents: 0, totalCents: 0 });
    expect(
      calculateTotals(items, { type: 'percent', value: 150 }, 0.16),
    ).toMatchObject({ discountCents: 4500, totalCents: 0 });
  });

  it('rounds half-cents up', () => {
    // 15 / (1 + 1.00) = 7.5 → net 8, tax 7
    expect(
      calculateTotals([{ qty: 1, unitPriceCents: 15 }], undefined, 1),
    ).toMatchObject({ taxCents: 7, totalCents: 15 });
    // 5% of 10 cents = 0.5 → 1
    expect(
      calculateTotals(
        [{ qty: 1, unitPriceCents: 10 }],
        { type: 'percent', value: 5 },
        0,
      ),
    ).toMatchObject({ discountCents: 1, totalCents: 9 });
  });

  it('treats 0% as no discount and 100% as nothing to pay', () => {
    expect(calculateTotals(items, { type: 'percent', value: 0 }, 0.16)).toEqual(
      calculateTotals(items, undefined, 0.16),
    );
    expect(
      calculateTotals(items, { type: 'percent', value: 100 }, 0.16),
    ).toMatchObject({ discountCents: 4500, taxCents: 0, totalCents: 0 });
  });

  it('keeps every amount a consistent integer across prices, discounts and rates', () => {
    const discounts = [
      undefined,
      { type: 'percent', value: 33 },
      { type: 'percent', value: 100 },
      { type: 'amount', value: 1 },
      { type: 'amount', value: 999 },
    ] as const;
    for (const unitPriceCents of [1, 15, 999, 12_345, 2_147_483_647])
      for (const qty of [1, 3, 7])
        for (const discount of discounts)
          for (const rate of [0, 0.08, 0.16]) {
            const t = calculateTotals(
              [{ qty, unitPriceCents }],
              discount,
              rate,
            );
            expect(Object.values(t).every(Number.isSafeInteger)).toBe(true);
            expect(t.subtotalCents).toBe(qty * unitPriceCents);
            expect(t.totalCents).toBe(t.subtotalCents - t.discountCents);
            expect(t.discountCents).toBeGreaterThanOrEqual(0);
            expect(t.discountCents).toBeLessThanOrEqual(t.subtotalCents);
            expect(t.taxCents).toBeGreaterThanOrEqual(0);
            expect(t.taxCents).toBeLessThanOrEqual(t.totalCents);
            if (rate === 0) expect(t.taxCents).toBe(0);
          }
  });

  it('returns zeros for an empty cart', () => {
    expect(calculateTotals([], undefined, 0.16)).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});
