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
 * Prices exclude tax. A percent discount is a whole number (10 = 10%);
 * an amount discount is in cents. Tax applies after the discount.
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
  // Basis points keep the multiplication in integers, so x.5 rounds exactly.
  const taxBasisPoints = Math.round(taxRate * 10_000);
  const taxCents = Math.round(
    ((subtotalCents - discountCents) * taxBasisPoints) / 10_000,
  );
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: subtotalCents - discountCents + taxCents,
  };
}
