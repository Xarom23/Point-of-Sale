import { Minus, Plus, Trash2 } from 'lucide-react'
import { useReducer, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cartReducer, cartTotals, type Discount } from '@/cart'
import { api } from '@/lib/api'
import { useAction, useFetch } from '@/lib/hooks'
import { formatMoney, toCents } from '@/lib/money'
import type { Product } from '@/pages/ProductsPage'

type DiscountType = 'none' | Discount['type']

function toDiscount(type: DiscountType, raw: string): Discount | undefined {
  if (type === 'none' || raw === '') return undefined
  const value = type === 'percent' ? Number(raw) : toCents(raw)
  return Number.isInteger(value) && value >= 0 ? { type, value } : undefined
}

export function CheckoutPage() {
  const [q, setQ] = useState('')
  const { data: products = [], reload } = useFetch<Product[]>(
    `/products?q=${encodeURIComponent(q)}`,
  )
  const { data: config } = useFetch<{ taxRate: number }>('/sales/config')
  const [cart, dispatch] = useReducer(cartReducer, [])
  const [discountType, setDiscountType] = useState<DiscountType>('none')
  const [discountRaw, setDiscountRaw] = useState('')
  const navigate = useNavigate()
  const { error, run } = useAction('Stock insuficiente: revisa las cantidades del carrito')

  const taxRate = config?.taxRate ?? 0
  const discount = toDiscount(discountType, discountRaw)
  const totals = cartTotals(cart, discount, taxRate)

  const add = (product: Product) => {
    dispatch({ type: 'add', product })
  }

  // Barcode scanners type the SKU and press Enter.
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const match =
      products.find((p) => p.sku.toLowerCase() === q.trim().toLowerCase()) ??
      (products.length === 1 ? products[0] : undefined)
    if (match) {
      add(match)
      setQ('')
    }
  }

  const charge = async () => {
    const charged = await run(async () => {
      const sale = await api<{ id: number }>('/sales', {
        method: 'POST',
        body: {
          items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
          discount,
        },
      })
      navigate(`/receipt/${sale.id}`)
    })
    if (!charged) reload() // refresh stock after a 409
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="grid content-start gap-4 lg:col-span-3">
        <h1 className="text-2xl font-semibold">Caja</h1>
        <Input
          type="search"
          placeholder="Buscar o escanear SKU y presionar Enter"
          aria-label="Buscar producto"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          autoFocus
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {products.slice(0, 30).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => add(p)}
                disabled={p.stock === 0}
                className="flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left hover:bg-accent disabled:opacity-50"
              >
                <span>
                  <span className="block font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.sku} · {p.stock === 0 ? 'Sin stock' : `${p.stock} disp.`}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(p.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid content-start gap-4 rounded-xl border p-4 lg:col-span-2">
        <h2 className="text-lg font-semibold">Carrito</h2>

        {cart.length === 0 && (
          <p className="text-sm text-muted-foreground">Agrega productos para empezar.</p>
        )}
        <ul className="grid gap-3">
          {cart.map(({ product, qty }) => (
            <li key={product.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(product.priceCents)} c/u
                </p>
              </div>
              <Button size="icon-sm" variant="outline" aria-label={`Quitar uno de ${product.name}`}
                onClick={() => dispatch({ type: 'setQty', productId: product.id, qty: qty - 1 })}>
                <Minus />
              </Button>
              <Input
                type="number"
                min={1}
                max={product.stock}
                value={qty}
                aria-label={`Cantidad de ${product.name}`}
                onChange={(e) => {
                  // An empty field while retyping shouldn't drop the line.
                  const n = e.target.valueAsNumber
                  if (!Number.isNaN(n)) dispatch({ type: 'setQty', productId: product.id, qty: n })
                }}
                className="w-16 text-center"
              />
              <Button size="icon-sm" variant="outline" aria-label={`Agregar uno de ${product.name}`}
                onClick={() => dispatch({ type: 'add', product })}>
                <Plus />
              </Button>
              <span className="w-20 text-right tabular-nums">{formatMoney(product.priceCents * qty)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${product.name}`}
                onClick={() => dispatch({ type: 'remove', productId: product.id })}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label htmlFor="discountType">Descuento</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
              <SelectTrigger id="discountType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin descuento</SelectItem>
                <SelectItem value="percent">Porcentaje (%)</SelectItem>
                <SelectItem value="amount">Monto ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {discountType !== 'none' && (
            <div className="grid gap-2">
              <Label htmlFor="discountValue">{discountType === 'percent' ? '%' : 'Monto'}</Label>
              <Input
                id="discountValue"
                inputMode="decimal"
                value={discountRaw}
                onChange={(e) => setDiscountRaw(e.target.value)}
                aria-invalid={discountRaw !== '' && !discount}
              />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-1 border-t pt-4 tabular-nums">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatMoney(totals.subtotalCents)}</dd>
          <dt>Descuento</dt>
          <dd className="text-right">−{formatMoney(totals.discountCents)}</dd>
          <dt className="text-lg font-semibold">Total</dt>
          <dd className="text-right text-lg font-semibold">{formatMoney(totals.totalCents)}</dd>
          <dt className="text-sm text-muted-foreground">IVA incluido ({Math.round(taxRate * 100)}%)</dt>
          <dd className="text-right text-sm text-muted-foreground">{formatMoney(totals.taxCents)}</dd>
        </dl>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button size="lg" disabled={cart.length === 0 || !config} onClick={charge}>
          Cobrar {formatMoney(totals.totalCents)}
        </Button>
      </section>
    </div>
  )
}
