# POS MVP — Product Backlog

Sprint único de 5 días. Prioridad: **M** = Must y **S** = Should (se recortan primero). Puntos en escala Fibonacci.

## Decisiones técnicas

| Tema | Decisión |
|---|---|
| ORM | TypeORM (`autoLoadEntities: true`) |
| Estructura | Backend en la raíz y frontend en `web/` |
| Dinero | Enteros en centavos (`price_cents`) |
| Impuesto | Tasa global en `.env` (`TAX_RATE=0.16`). Los precios **no incluyen IVA**: se suma sobre `subtotal − descuento` |
| Descuento | Por venta, en porcentaje o monto fijo |
| Stock | En la transacción de venta los productos se bloquean con `SELECT … FOR UPDATE` (en orden de id), se valida el stock y se descuenta. Un test e2e de concurrencia lo comprueba |
| Stock bajo | Campo `min_stock`, filtro `?lowStock=true` y badge en la UI |
| Recibo | Vista HTML imprimible (`window.print()`) |
| Auth | `@nestjs/jwt` + `bcrypt` + `RolesGuard` (`admin` / `cashier`) |
| Histórico | `sale_items.unit_price_cents` guarda una copia del precio al momento de vender |

**Modelo de datos:** `users(role)`, `categories`, `products(sku, price_cents, stock, min_stock, category_id, active)`, `sales(user_id, subtotal, discount, tax, total, created_at)`, `sale_items(sale_id, product_id, qty, unit_price_cents)`.

## Enfoque TDD

Cada historia sigue el ciclo **Red → Green → Refactor**:

1. **Red:** se escribe primero el test que corresponde a un criterio de aceptación y se comprueba que falla.
2. **Green:** se escribe el mínimo código que lo hace pasar.
3. **Refactor:** se limpia el código con los tests en verde.

| Nivel | Qué se prueba | Herramienta | Archivo |
|---|---|---|---|
| Unitario | Lógica pura: cálculo de totales e impuestos, reglas de roles | Vitest | `src/**/*.spec.ts` |
| E2E (API) | Cada criterio de aceptación de un endpoint, contra Postgres real | Vitest + Supertest | `test/**/*.e2e-spec.ts` |
| Frontend | Lógica del carrito | Vitest | `web/src/**/*.test.ts` |

Reglas:

- **Los criterios de aceptación son los tests.** Cada bullet de una historia tiene al menos un test.
- La lógica de dinero (US-10) vive en funciones puras con su propio test unitario. No se mockea la base de datos: los e2e corren contra el Postgres de Docker.
- Los e2e limpian sus tablas en `beforeEach` (`TRUNCATE ... CASCADE`).
- En el historial de git se ve el ciclo: `test(scope): ...` (rojo) y luego `feat(scope): ...` (verde).
- No se testean componentes visuales de shadcn ni getters triviales.

## Definition of Done

- Todos los criterios de aceptación tienen su test y está en verde.
- Pasan `npm run lint`, `npm test` y `npm run test:e2e`.
- Se hizo merge del PR a `develop` y la funcionalidad se probó de punta a punta desde la UI.

---

## Épica 0 — Infraestructura

### US-01 · Setup del backend con PostgreSQL (M, 2)
*Como dev quiero levantar el entorno con un solo comando para empezar a desarrollar.*
- [x] `docker compose up -d` levanta Postgres con la base de datos creada.
- [x] `npm run start:dev` conecta sin errores, también en el build ESM.
- [x] Existe `.env.example` con todas las variables.

**Test:** `test/app.e2e-spec.ts` → `connects to PostgreSQL`.

### US-02 · Setup del frontend (M, 2)
- [x] `web/` con Vite, React, TypeScript, Tailwind, shadcn/ui y Vitest.
- [x] Cliente HTTP con la URL base tomada de `VITE_API_URL`.
- [x] Layout con sidebar y rutas protegidas.

## Épica 1 — Usuarios y roles

### US-03 · Login (M, 3)
*Como usuario quiero iniciar sesión para acceder según mi rol.*
- [x] `POST /auth/login` devuelve un JWT si las credenciales son válidas y 401 si no.
- [x] Las contraseñas se guardan con bcrypt y `password` nunca aparece en una respuesta.
- [x] Un seed crea el admin inicial desde `.env`.

**Tests primero (e2e):** login válido → 200 + `access_token`; contraseña incorrecta → 401; la respuesta no contiene `password`.

### US-04 · Autorización por rol (M, 2)
- [x] Endpoints sin token devuelven 401.
- [x] Un cajero que intenta escribir en productos, o acceder a usuarios o reportes, recibe 403.
- [x] El frontend oculta el menú que el rol no puede usar.

**Tests primero (e2e):** sin token → 401; cajero en `POST /products` → 403; admin → 201.

### US-05 · Admin gestiona usuarios (S, 2)
- [ ] El admin puede crear un usuario, asignarle rol y desactivarlo.
- [ ] Un usuario desactivado no puede iniciar sesión (401).

## Épica 2 — Inventario

### US-06 · CRUD de categorías (M, 2)
- [x] El admin crea, edita y elimina categorías.
- [x] Eliminar una categoría que tiene productos devuelve 409.

**Tests primero (e2e):** CRUD completo; borrar una categoría con productos → 409.

### US-07 · CRUD de productos (M, 3)
- [x] El admin crea y edita productos con nombre, SKU único, precio, stock, stock mínimo y categoría.
- [x] Validación con DTOs: precio ≥ 0 y stock ≥ 0 (si no, 400).
- [x] Borrar un producto lo desactiva (soft delete) y deja de aparecer en el listado.
- [x] Búsqueda por nombre o SKU (`?q=`).

**Tests primero (e2e):** SKU duplicado → 409; precio negativo → 400; un producto borrado no aparece en `GET /products`; `?q=` filtra.

### US-08 · Alerta de stock bajo (M, 1)
- [x] `GET /products?lowStock=true` devuelve solo los productos con `stock <= min_stock`.
- [x] Badge rojo en la lista de productos. *(el del dashboard llega con US-16)*

**Tests primero (e2e):** con 2 productos (uno bajo y uno normal), solo se devuelve el bajo.

### US-09 · Ajuste manual de stock (S, 1)
- [ ] El admin suma o resta stock indicando un motivo; el stock nunca queda negativo (si quedaría, 409).

## Épica 3 — Ventas (checkout)

### US-10 · Registrar venta (M, 5) ⭐
*Como cajero quiero cobrar un carrito para registrar la venta y descontar el inventario.*
- [x] `POST /sales` con `items[]` y `discount` se ejecuta en una sola transacción.
- [x] Si algún producto no tiene stock suficiente, la venta completa se rechaza con 409 y no se descuenta nada.
- [x] El servidor calcula subtotal, descuento, impuesto y total, y ignora cualquier monto que mande el cliente.
- [x] El stock baja al confirmar la venta.

**Tests primero:**
- Unitario `calculateTotals(items, discount, taxRate)`: con descuento porcentual, con descuento fijo, cuando el descuento es mayor al subtotal y el redondeo a centavos.
- E2E: una venta válida descuenta el stock; si un ítem no alcanza → 409 y el stock de **todos** los ítems queda intacto; un `total` enviado por el cliente se ignora.

### US-11 · Pantalla de caja (M, 3)
- [x] Buscar un producto y agregarlo al carrito.
- [x] Cambiar la cantidad o quitar productos.
- [x] Totales en vivo y botón "Cobrar".

**Tests primero (unitario web):** reducer del carrito (agregar, sumar cantidad, quitar).

### US-12 · Recibo (M, 2)
- [ ] Después de cobrar se muestra un recibo con folio, fecha, cajero, artículos y totales, y se puede imprimir.
- [ ] `GET /sales/:id` permite reimprimirlo.

## Épica 4 — Reportes

### US-13 · Historial de ventas (M, 2)
- [ ] Lista paginada con filtro `from`/`to`.
- [ ] El cajero solo ve sus propias ventas y el admin ve todas.

**Tests primero (e2e):** un cajero no ve las ventas de otro cajero.

### US-14 · Resumen diario y mensual (M, 2)
- [ ] `GET /reports/summary?from&to&groupBy=day|month` devuelve el número de ventas y el total de cada periodo.

**Tests primero (e2e):** con ventas sembradas en 2 días distintos se obtienen 2 filas con los totales correctos.

### US-15 · Productos más vendidos (M, 1)
- [ ] Top 10 por unidades vendidas dentro de un rango de fechas.

### US-16 · Dashboard (S, 2)
- [ ] Tarjetas con las ventas de hoy, las ventas del mes y la cantidad de productos con stock bajo, más el top 5 de productos.

**Total: 37 pts.**

---

## Plan del sprint

| Día | Backend | Frontend |
|---|---|---|
| 1 | US-01, US-03, US-04 | US-02, login |
| 2 | US-06, US-07, US-08 | CRUD de categorías y productos |
| 3 | **US-10** | US-11 |
| 4 | US-13, US-14, US-15 | US-12 y US-13 (UI) |
| 5 | US-05, US-09, US-16 si sobra tiempo | Dashboard, README y release `v1.0.0` |

## Gitflow y commits

- `main` (releases) ← `develop` ← `feature/US-XX-descripcion`.
- Release: `release/1.0.0` → merge a `main` + tag `v1.0.0` → merge de vuelta a `develop`.
- [Conventional Commits](https://www.conventionalcommits.org/): `test(sales): ...`, `feat(sales): ...`, `fix(auth): ...`, `refactor: ...`, `chore(docker): ...`, `docs: ...`.

## Fuera del MVP

Turnos y corte de caja, devoluciones, varias sucursales, PDF real y migraciones (antes de producción se cambia `synchronize: true` por migraciones de TypeORM).
