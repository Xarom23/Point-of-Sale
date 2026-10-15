import { formatMoney, toCents } from './money'

describe('toCents', () => {
  it.each([
    ['18.50', 1850],
    ['18.5', 1850],
    ['20', 2000],
    ['0.1', 10],
    ['1.005', 101], // rounds half up instead of float-truncating to 100
    ['19.99', 1999], // 19.99 * 100 = 1998.9999… in floating point
  ])('%s → %i', (input, cents) => {
    expect(toCents(input)).toBe(cents)
  })

  it.each(['', 'abc', '-1'])('rejects "%s" with NaN', (input) => {
    expect(toCents(input)).toBeNaN()
  })
})

describe('formatMoney', () => {
  it('formats cents as MXN', () => {
    expect(formatMoney(123456)).toBe('$1,234.56')
  })
})
