import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { navFor } from '@/nav'

const ROLE_LABEL = { admin: 'Administrador', cashier: 'Cajero' }

export function Layout() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground md:w-56 md:border-r md:border-b-0">
        <div>
          <p className="font-heading text-lg font-semibold">POS</p>
          <p className="text-sm text-muted-foreground">
            {user.username} · {ROLE_LABEL[user.role]}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {navFor(user.role).map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-sidebar-accent',
                  isActive && 'bg-sidebar-accent font-medium',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" className="justify-start md:mt-auto" onClick={logout}>
          <LogOut aria-hidden />
          Cerrar sesión
        </Button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
