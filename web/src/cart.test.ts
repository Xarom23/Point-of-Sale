import { cartReducer, cartTotals, type Cart } from './cart'
import type { Product } from './pages/ProductsPage'

const product = (id: number, priceCents: number, stock: number) =>
  ({ id, name: `P${id}`, sku: `P${id}`, priceCents, stock }) as Product

const a = product(1, 1000, 3)
const b = product(2, 2500, 10)

describe('cartReducer', () => {
  it('adds a new product with quantity 1', () => {
    expect(cartReducer([], { type: 'add', product: a })).toEqual([
      { product: a, qty: 1 },
    ])
  })

  it('increments a product already in the cart', () => {
    const cart = cartReducer([{ product: a, qty: 1 }], { type: 'add', product: a })
    expect(cart).toEqual([{ product: a, qty: 2 }])
  })

  it('never goes above the available stock', () => {
    const cart: Cart = [{ product: a, qty: 3 }]
    expect(cartReducer(cart, { type: 'add', product: a })).toEqual(cart)
    expect(cartReducer(cart, { type: 'setQty', productId: 1, qty: 9 })).toEqual(cart)
  })

  it('ignores products without stock', () => {
    expect(cartReducer([], { type: 'add', product: product(3, 100, 0) })).toEqual([])
  })

  it('sets a quantity and removes the line at zero', () => {
    const cart: Cart = [{ product: a, qty: 1 }, { product: b, qty: 1 }]
    expect(cartReducer(cart, { type: 'setQty', productId: 2, qty: 4 })).toEqual([
      { product: a, qty: 1 },
      { product: b, qty: 4 },
    ])
    expect(cartReducer(cart, { type: 'setQty', productId: 2, qty: 0 })).toEqual([
      { product: a, qty: 1 },
    ])
  })

  it('removes a line and clears the cart', () => {
    const cart: Cart = [{ product: a, qty: 1 }, { product: b, qty: 1 }]
    expect(cartReducer(cart, { type: 'remove', productId: 1 })).toEqual([
      { product: b, qty: 1 },
    ])
    expect(cartReducer(cart, { type: 'clear' })).toEqual([])
  })
})

describe('cartTotals', () => {
  it('uses the same calculation as the server', () => {
    const cart: Cart = [{ product: a, qty: 2 }, { product: b, qty: 1 }]
    expect(cartTotals(cart, { type: 'percent', value: 10 }, 0.16)).toEqual({
      subtotalCents: 4500,
      discountCents: 450,
      taxCents: 648,
      totalCents: 4698,
    })
  })
})
