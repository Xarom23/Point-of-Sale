import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/auth'
import { Layout } from '@/Layout'
import { LoginPage } from '@/LoginPage'
import { navFor } from '@/nav'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ReceiptPage } from '@/pages/ReceiptPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SalesHistoryPage } from '@/pages/SalesHistoryPage'
import { UsersPage } from '@/pages/UsersPage'

const PAGES: Record<string, ReactNode> = {
  '/users': <UsersPage />,
  '/reports': <ReportsPage />,
  '/': <CheckoutPage />,
  '/sales': <SalesHistoryPage />,
  '/products': <ProductsPage />,
  '/categories': <CategoriesPage />,
}

// Only the routes the user's role may see are registered, so any other URL
// (including /login once signed in) falls through to the redirect.
export default function App() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {navFor(user.role).map(({ path, label }) => (
          <Route
            key={path}
            path={path}
            element={
              PAGES[path] ?? <h1 className="text-2xl font-semibold">{label}</h1>
            }
          />
        ))}
      </Route>
      <Route path="/receipt/:id" element={<ReceiptPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
