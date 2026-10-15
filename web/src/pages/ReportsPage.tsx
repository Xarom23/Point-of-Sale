import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useFetch } from '@/lib/hooks'
import { formatMoney } from '@/lib/money'

type SummaryRow = { period: string; salesCount: number; totalCents: number }
type TopRow = { productId: number; name: string; qty: number; totalCents: number }

/** YYYY-MM-DD in the browser's timezone ('en-CA' formats dates that way). */
export const isoDate = (d: Date) => d.toLocaleDateString('en-CA')

export function ReportsPage() {
  // Defaults to the current month.
  const [from, setFrom] = useState(() => {
    const today = new Date()
    return isoDate(new Date(today.getFullYear(), today.getMonth(), 1))
  })
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day')

  const range = new URLSearchParams()
  if (from) range.set('from', from)
  if (to) range.set('to', to)
  const { data: summary = [] } = useFetch<SummaryRow[]>(`/reports/summary?${range}&groupBy=${groupBy}`)
  const { data: top = [] } = useFetch<TopRow[]>(`/reports/top-products?${range}`)

  const salesCount = summary.reduce((n, r) => n + r.salesCount, 0)
  const totalCents = summary.reduce((n, r) => n + r.totalCents, 0)

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Reportes</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="groupBy">Agrupar por</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'month')}>
            <SelectTrigger id="groupBy" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <h2 className="text-lg font-semibold">Resumen de ventas</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupBy === 'day' ? 'Día' : 'Mes'}</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((r) => (
                <TableRow key={r.period}>
                  <TableCell className="tabular-nums">{r.period}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.salesCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.totalCents)}</TableCell>
                </TableRow>
              ))}
              {summary.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin ventas en este periodo
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{salesCount}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(totalCents)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className="grid content-start gap-2">
          <h2 className="text-lg font-semibold">Productos más vendidos</h2>
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
                    Sin ventas en este periodo
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">Importe a precio de lista, antes de descuentos.</p>
        </div>
      </div>
    </section>
  )
}
