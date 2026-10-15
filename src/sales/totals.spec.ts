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

  it('returns zeros for an empty cart', () => {
    expect(calculateTotals([], undefined, 0.16)).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});
