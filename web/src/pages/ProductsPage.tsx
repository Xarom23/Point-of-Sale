import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { useAction, useFetch } from '@/lib/hooks'
import { formatMoney, toCents } from '@/lib/money'
import type { Category } from '@/pages/CategoriesPage'

export type Product = {
  id: number
  name: string
  sku: string
  priceCents: number
  stock: number
  minStock: number
  categoryId: number
  category: Category
}

const DUPLICATE_SKU = 'Ya existe un producto con ese SKU'

export function ProductsPage() {
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const { data: products = [], reload } = useFetch<Product[]>(
    `/products?q=${encodeURIComponent(q)}${lowOnly ? '&lowStock=true' : ''}`,
  )
  const { error, run } = useAction()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)

  const remove = async ({ id, name }: Product) => {
    if (!confirm(`¿Eliminar el producto "${name}"?`)) return
    await run(() => api(`/products/${id}`, { method: 'DELETE' }))
    reload()
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden />
          Nuevo producto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          placeholder="Buscar por nombre o SKU"
          aria-label="Buscar productos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant={lowOnly ? 'destructive' : 'outline'}
          aria-pressed={lowOnly}
          onClick={() => setLowOnly(!lowOnly)}
        >
          <TriangleAlert aria-hidden />
          Solo stock bajo
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="w-24 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.sku}</TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.category.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(p.priceCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.stock <= p.minStock ? (
                  <Badge variant="destructive" title={`Mínimo: ${p.minStock}`}>
                    {p.stock} · bajo
                  </Badge>
                ) : (
                  p.stock
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Eliminar ${p.name}`} onClick={() => remove(p)}>
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {products.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Sin productos
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {editing && (
        <ProductDialog
          product={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </section>
  )
}

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product?: Product
  onClose: () => void
  onSaved: () => void
}) {
  const { data: categories = [] } = useFetch<Category[]>('/categories')
  const { error, run } = useAction(DUPLICATE_SKU)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = {
      name: String(f.get('name')).trim(),
      sku: String(f.get('sku')).trim(),
      priceCents: toCents(String(f.get('price'))),
      minStock: Number(f.get('minStock')),
      categoryId: Number(f.get('categoryId')),
      ...(!product && { stock: Number(f.get('stock')) }),
    }
    const saved = await run(() =>
      product
        ? api(`/products/${product.id}`, { method: 'PATCH', body })
        : api('/products', { method: 'POST', body }),
    )
    if (saved) onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form id="product-form" onSubmit={submit} className="grid gap-4">
          <Field label="Nombre" htmlFor="name">
            <Input id="name" name="name" defaultValue={product?.name} required maxLength={150} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU" htmlFor="sku">
              <Input id="sku" name="sku" defaultValue={product?.sku} required maxLength={50} />
            </Field>
            <Field label="Precio" htmlFor="price">
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                title="Ej. 18.50"
                defaultValue={product && (product.priceCents / 100).toFixed(2)}
                required
              />
            </Field>
            {!product && (
              <Field label="Stock inicial" htmlFor="stock">
                <Input id="stock" name="stock" type="number" min={0} step={1} defaultValue={0} required />
              </Field>
            )}
            <Field label="Stock mínimo" htmlFor="minStock">
              <Input id="minStock" name="minStock" type="number" min={0} step={1} defaultValue={product?.minStock ?? 0} required />
            </Field>
          </div>
          <Field label="Categoría" htmlFor="categoryId">
            <Select name="categoryId" defaultValue={product?.categoryId.toString()} required>
              <SelectTrigger id="categoryId" className="w-full">
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
