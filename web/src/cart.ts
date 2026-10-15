import { calculateTotals, type Discount } from '../../src/sales/totals'
import type { Product } from '@/pages/ProductsPage'

export type { Discount }
export type Cart = { product: Product; qty: number }[]

export type CartAction =
  | { type: 'add'; product: Product }
  | { type: 'setQty'; productId: number; qty: number }
  | { type: 'remove'; productId: number }
  | { type: 'clear' }

export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'add': {
      const { product } = action
      const line = cart.find((l) => l.product.id === product.id)
      if (!line) return product.stock > 0 ? [...cart, { product, qty: 1 }] : cart
      return cartReducer(cart, { type: 'setQty', productId: product.id, qty: line.qty + 1 })
    }
    case 'setQty':
      if (action.qty <= 0) return cartReducer(cart, { type: 'remove', productId: action.productId })
      return cart.map((l) =>
        l.product.id === action.productId
          ? { ...l, qty: Math.min(action.qty, l.product.stock) }
          : l,
      )
    case 'remove':
      return cart.filter((l) => l.product.id !== action.productId)
    case 'clear':
      return []
  }
}

export const cartTotals = (cart: Cart, discount: Discount | undefined, taxRate: number) =>
  calculateTotals(
    cart.map((l) => ({ qty: l.qty, unitPriceCents: l.product.priceCents })),
    discount,
    taxRate,
  )
