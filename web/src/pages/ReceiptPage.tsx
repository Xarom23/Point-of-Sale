import { Printer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useFetch } from '@/lib/hooks'
import { formatMoney } from '@/lib/money'

export type SaleDetail = {
  id: number
  createdAt: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  user: { username: string }
  items: { id: number; name: string; qty: number; unitPriceCents: number }[]
}

export const folio = (id: number) => `#${String(id).padStart(6, '0')}`

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

/** Printable 80 mm ticket, rendered outside the app layout. */
export function ReceiptPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: sale, error } = useFetch<SaleDetail>(`/sales/${id}`)

  if (error) {
    return <p className="p-6 text-destructive">No se encontró la venta.</p>
  }
  if (!sale) return null

  return (
    <main className="mx-auto grid max-w-[80mm] gap-3 p-4 font-mono text-xs print:p-0">
      <header className="text-center">
        <p className="text-base font-bold">POS</p>
        <p>Folio {folio(sale.id)}</p>
        <p>{formatDate(sale.createdAt)}</p>
        <p>Cajero: {sale.user.username}</p>
      </header>

      <table className="w-full border-y border-dashed border-current">
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1 pr-2">
                {item.qty} × {item.name}
                <br />
                <span className="text-muted-foreground">
                  {formatMoney(item.unitPriceCents)} c/u
                </span>
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatMoney(item.qty * item.unitPriceCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid grid-cols-2 tabular-nums">
        <dt>Subtotal</dt>
        <dd className="text-right">{formatMoney(sale.subtotalCents)}</dd>
        {sale.discountCents > 0 && (
          <>
            <dt>Descuento</dt>
            <dd className="text-right">−{formatMoney(sale.discountCents)}</dd>
          </>
        )}
        <dt className="text-sm font-bold">Total</dt>
        <dd className="text-right text-sm font-bold">{formatMoney(sale.totalCents)}</dd>
        <dt>IVA incluido</dt>
        <dd className="text-right">{formatMoney(sale.taxCents)}</dd>
      </dl>

      <p className="text-center">¡Gracias por su compra!</p>

      <div className="flex gap-2 font-sans print:hidden">
        <Button className="flex-1" onClick={() => window.print()} autoFocus>
          <Printer aria-hidden />
          Imprimir
        </Button>
        <Button className="flex-1" variant="outline" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
    </main>
  )
}
