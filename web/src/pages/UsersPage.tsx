import { KeyRound, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '@/auth'
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
import type { Role } from '@/nav'

type User = { id: number; username: string; role: Role; active: boolean }

const ROLES: Record<Role, string> = { admin: 'Administrador', cashier: 'Cajero' }

export function UsersPage() {
  const { user: me } = useAuth()
  const { data: users = [], reload } = useFetch<User[]>('/users')
  const { error, run } = useAction()
  // A user to reset the password for, or 'new' to create one.
  const [dialog, setDialog] = useState<User | 'new' | null>(null)

  const update = async (id: number, body: Partial<User>) => {
    await run(() => api(`/users/${id}`, { method: 'PATCH', body }))
    reload()
  }

  return (
    <section className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Button onClick={() => setDialog('new')}>
          <Plus aria-hidden />
          Nuevo usuario
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
            <TableHead>Usuario</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isMe = u.id === me?.sub
            return (
              <TableRow key={u.id}>
                <TableCell>
                  {u.username}
                  {isMe && <span className="text-muted-foreground"> (tú)</span>}
                </TableCell>
                <TableCell>
                  <Select value={u.role} disabled={isMe} onValueChange={(role) => update(u.id, { role: role as Role })}>
                    <SelectTrigger className="w-40" aria-label={`Rol de ${u.username}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? 'secondary' : 'outline'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setDialog(u)}>
                    <KeyRound aria-hidden />
                    Contraseña
                  </Button>
                  <Button size="sm" variant="outline" disabled={isMe} onClick={() => update(u.id, { active: !u.active })}>
                    {u.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {dialog && (
        <UserDialog
          user={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            reload()
          }}
        />
      )}
    </section>
  )
}

/** Creates a user, or resets `user`'s password. */
function UserDialog({ user, onClose, onSaved }: { user?: User; onClose: () => void; onSaved: () => void }) {
  const { error, run } = useAction('Ya existe un usuario con ese nombre')
  const [role, setRole] = useState<Role>('cashier')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    const saved = await run(() =>
      user
        ? api(`/users/${user.id}`, { method: 'PATCH', body: { password } })
        : api('/users', { method: 'POST', body: { username: String(f.get('username')).trim(), password, role } }),
    )
    if (saved) onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? `Nueva contraseña para ${user.username}` : 'Nuevo usuario'}</DialogTitle>
        </DialogHeader>
        <form id="user-form" onSubmit={submit} className="grid gap-4">
          {!user && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="username">Usuario</Label>
                <Input id="username" name="username" autoComplete="off" required maxLength={50} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>
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
          <Button type="submit" form="user-form">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
