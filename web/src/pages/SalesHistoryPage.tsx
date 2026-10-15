import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { folio, formatDate, type SaleDetail } from '@/pages/ReceiptPage'

const LIMIT = 20

type Page = { data: Omit<SaleDetail, 'items'>[]; total: number }

export function SalesHistoryPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const { data, error } = useFetch<Page>(`/sales?${params}`)
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT))
  const isAdmin = user?.role === 'admin'

  const onDate = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Ventas</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} max={to || undefined} onChange={onDate(setFrom)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} min={from || undefined} onChange={onDate(setTo)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Folio</TableHead>
            <TableHead>Fecha</TableHead>
            {isAdmin && <TableHead>Cajero</TableHead>}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Recibo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.data.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{folio(s.id)}</TableCell>
              <TableCell>{formatDate(s.createdAt)}</TableCell>
              {isAdmin && <TableCell>{s.user.username}</TableCell>}
              <TableCell className="text-right tabular-nums">{formatMoney(s.totalCents)}</TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/receipt/${s.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Sin ventas en este periodo
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">
          Página {page} de {pages} · {data?.total ?? 0} ventas
        </span>
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </section>
  )
}
