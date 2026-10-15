import { navFor } from './nav'

const paths = (role: 'admin' | 'cashier') => navFor(role).map((i) => i.path)

describe('navFor', () => {
  it('shows a cashier only the checkout and sales history', () => {
    expect(paths('cashier')).toEqual(['/', '/sales'])
  })

  it('shows an admin every section, starting at the dashboard', () => {
    expect(paths('admin')).toEqual([
      '/dashboard',
      '/',
      '/sales',
      '/products',
      '/categories',
      '/reports',
      '/users',
    ])
  })
})
