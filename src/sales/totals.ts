// Shared with the web app (web/src/cart.ts) so the checkout preview and the
// server always agree. Keep it dependency-free.

export type Discount = { type: 'percent' | 'amount'; value: number };

export type Totals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

/**
 * Prices include tax (shelf price = price charged). A percent discount is a
 * whole number (10 = 10%); an amount discount is in cents. `taxCents` is the
 * tax contained in the discounted total, shown on the receipt.
 */
export function calculateTotals(
  items: { qty: number; unitPriceCents: number }[],
  discount: Discount | undefined,
  taxRate: number,
): Totals {
  const subtotalCents = items.reduce(
    (sum, i) => sum + i.qty * i.unitPriceCents,
    0,
  );
  const requested =
    discount?.type === 'percent'
      ? Math.round((subtotalCents * discount.value) / 100)
      : (discount?.value ?? 0);
  const discountCents = Math.min(requested, subtotalCents);
  const totalCents = subtotalCents - discountCents;
  // Basis points keep the arithmetic in integers, so x.5 rounds exactly.
  const taxBasisPoints = Math.round(taxRate * 10_000);
  const netCents = Math.round(
    (totalCents * 10_000) / (10_000 + taxBasisPoints),
  );
  return {
    subtotalCents,
    discountCents,
    taxCents: totalCents - netCents,
    totalCents,
  };
}
