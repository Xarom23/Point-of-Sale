import {
  ChartColumn,
  Package,
  Receipt,
  ShoppingCart,
  Tags,
  Users,
} from 'lucide-react'

export type Role = 'admin' | 'cashier'

const ALL: Role[] = ['admin', 'cashier']
const ADMIN: Role[] = ['admin']

export const NAV = [
  { path: '/', label: 'Caja', icon: ShoppingCart, roles: ALL },
  { path: '/sales', label: 'Ventas', icon: Receipt, roles: ALL },
  { path: '/products', label: 'Productos', icon: Package, roles: ADMIN },
  { path: '/categories', label: 'Categorías', icon: Tags, roles: ADMIN },
  { path: '/reports', label: 'Reportes', icon: ChartColumn, roles: ADMIN },
  { path: '/users', label: 'Usuarios', icon: Users, roles: ADMIN },
]

export const navFor = (role: Role) =>
  NAV.filter((item) => item.roles.includes(role))
