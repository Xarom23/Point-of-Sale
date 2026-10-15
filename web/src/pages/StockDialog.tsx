import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAction, useFetch } from '@/lib/hooks'
import type { Product } from '@/pages/ProductsPage'
import { formatDate } from '@/pages/ReceiptPage'

type Adjustment = {
  id: number
  delta: number
  reason: string
  createdAt: string
  user: { username: string }
}

const REASONS = ['Compra a proveedor', 'Merma', 'Conteo físico', 'Devolución']

export function StockDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product
  onClose: () => void
  onSaved: () => void
}) {
  const path = `/products/${product.id}/stock-adjustments`
  const { data: history = [] } = useFetch<Adjustment[]>(path)
  const { error, run } = useAction('El stock no puede quedar en negativo')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = { delta: Number(f.get('delta')), reason: String(f.get('reason')).trim() }
    if (await run(() => api(path, { method: 'POST', body }))) onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            {product.name} · stock actual: {product.stock}
          </DialogDescription>
        </DialogHeader>
        <form id="stock-form" onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="delta">Cantidad</Label>
            <Input id="delta" name="delta" type="number" step={1} min={-product.stock} required autoFocus />
            <p className="text-xs text-muted-foreground">Positiva para sumar, negativa para restar.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">Motivo</Label>
            <Input id="reason" name="reason" list="stock-reasons" required maxLength={200} />
            <datalist id="stock-reasons">
              {REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        {history.length > 0 && (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Últimos ajustes</p>
            <ul className="grid gap-1 text-muted-foreground">
              {history.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {formatDate(a.createdAt)} · {a.reason} · {a.user.username}
                  </span>
                  <span className="tabular-nums">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="stock-form">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
