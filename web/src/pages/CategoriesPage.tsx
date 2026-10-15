import { Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export type Category = { id: number; name: string }

const nameOf = (form: HTMLFormElement) =>
  String(new FormData(form).get('name')).trim()

export function CategoriesPage() {
  const { data: categories = [], reload } = useFetch<Category[]>('/categories')
  const { error, run } = useAction(
    'Ya existe una categoría con ese nombre o tiene productos asignados',
  )
  const [editing, setEditing] = useState<number | null>(null)

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const ok = await run(() =>
      api('/categories', { method: 'POST', body: { name: nameOf(form) } }),
    )
    if (ok) form.reset()
    reload()
  }

  const rename = async (e: FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault()
    const name = nameOf(e.currentTarget)
    if (await run(() => api(`/categories/${id}`, { method: 'PATCH', body: { name } }))) {
      setEditing(null)
    }
    reload()
  }

  const remove = async ({ id, name }: Category) => {
    if (!confirm(`¿Eliminar la categoría "${name}"?`)) return
    await run(() => api(`/categories/${id}`, { method: 'DELETE' }))
    reload()
  }

  return (
    <section className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">Categorías</h1>

      <form onSubmit={create} className="flex gap-2">
        <Input name="name" placeholder="Nueva categoría" aria-label="Nueva categoría" required />
        <Button type="submit">Agregar</Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="w-24 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {editing === c.id ? (
                  <form onSubmit={(e) => rename(e, c.id)} className="flex gap-2">
                    <Input name="name" defaultValue={c.name} aria-label="Nombre" required autoFocus />
                    <Button type="submit" size="sm">Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  c.name
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c.id)}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Eliminar ${c.name}`} onClick={() => remove(c)}>
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {categories.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                Sin categorías
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  )
}
