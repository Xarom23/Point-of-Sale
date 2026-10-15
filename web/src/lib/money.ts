const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

export const formatMoney = (cents: number) => currency.format(cents / 100)

/** Parses a non-negative decimal amount ("18.50") into integer cents without float error. */
export function toCents(input: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim())
  if (!match) return NaN
  const fraction = (match[2] ?? '').padEnd(3, '0')
  const roundUp = Number(fraction[2]) >= 5 ? 1 : 0
  return Number(match[1]) * 100 + Number(fraction.slice(0, 2)) + roundUp
}
