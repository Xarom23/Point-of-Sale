import { TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useFetch } from '@/lib/hooks'
import { formatMoney } from '@/lib/money'
import type { Product } from '@/pages/ProductsPage'
import { isoDate } from '@/pages/ReportsPage'

type SummaryRow = { salesCount: number; totalCents: number }
type TopRow = { productId: number; name: string; qty: number; totalCents: number }

const sum = (rows: SummaryRow[] = []) => ({
  salesCount: rows.reduce((n, r) => n + r.salesCount, 0),
  totalCents: rows.reduce((n, r) => n + r.totalCents, 0),
})

/** Admin landing: today, this month, low stock and the month's best sellers. */
export function DashboardPage() {
  const [{ today, monthStart }] = useState(() => {
    const now = new Date()
    return {
      today: isoDate(now),
      monthStart: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    }
  })
  const month = `from=${monthStart}&to=${today}`

  const { data: todayRows } = useFetch<SummaryRow[]>(`/reports/summary?from=${today}&to=${today}`)
  const { data: monthRows } = useFetch<SummaryRow[]>(`/reports/summary?${month}&groupBy=month`)
  const { data: lowStock = [] } = useFetch<Product[]>('/products?lowStock=true')
  const { data: top = [] } = useFetch<TopRow[]>(`/reports/top-products?${month}&limit=5`)

  const day = sum(todayRows)
  const monthTotals = sum(monthRows)

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Ventas de hoy" value={formatMoney(day.totalCents)} detail={`${day.salesCount} ventas`} />
        <StatTile label="Ventas del mes" value={formatMoney(monthTotals.totalCents)} detail={`${monthTotals.salesCount} ventas`} />
        <StatTile
          label="Productos con stock bajo"
          value={String(lowStock.length)}
          detail={
            lowStock.length > 0 ? (
              <Link to="/products" className="inline-flex items-center gap-1 text-destructive underline-offset-4 hover:underline">
                <TriangleAlert className="size-3.5" aria-hidden />
                Revisar inventario
              </Link>
            ) : (
              'Todo en orden'
            )
          }
        />
      </div>

      <div className="grid content-start gap-2">
        <h2 className="text-lg font-semibold">Más vendidos del mes</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((r, i) => (
              <TableRow key={r.productId}>
                <TableCell className="tabular-nums">{i + 1}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(r.totalCents)}</TableCell>
              </TableRow>
            ))}
            {top.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Aún no hay ventas este mes
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}
