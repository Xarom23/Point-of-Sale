import { calculateTotals } from './totals.js';

const items = [
  { qty: 2, unitPriceCents: 1000 },
  { qty: 1, unitPriceCents: 2500 },
];

describe('calculateTotals', () => {
  it('adds tax on top of the subtotal', () => {
    expect(calculateTotals(items, undefined, 0.16)).toEqual({
      subtotalCents: 4500,
      discountCents: 0,
      taxCents: 720,
      totalCents: 5220,
    });
  });

  it('applies a percent discount before tax', () => {
    expect(
      calculateTotals(items, { type: 'percent', value: 10 }, 0.16),
    ).toEqual({
      subtotalCents: 4500,
      discountCents: 450,
      taxCents: 648,
      totalCents: 4698,
    });
  });

  it('applies a fixed discount in cents', () => {
    expect(
      calculateTotals(items, { type: 'amount', value: 500 }, 0.16),
    ).toMatchObject({ discountCents: 500, taxCents: 640, totalCents: 4640 });
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
    // 1 * 15 * 0.10 = 1.5 cents of tax → 2
    expect(
      calculateTotals([{ qty: 1, unitPriceCents: 15 }], undefined, 0.1),
    ).toMatchObject({ taxCents: 2, totalCents: 17 });
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
