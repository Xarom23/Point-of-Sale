# Point-of-Sale

Punto de venta (POS) para un comercio pequeño: inventario, caja, recibos, usuarios con roles y reportes de ventas.

**Stack:** NestJS + TypeORM + PostgreSQL · React (Vite) + Tailwind CSS + shadcn/ui · Docker Compose.

## Funcionalidades

| Módulo | Qué incluye |
|---|---|
| **Inventario** | CRUD de categorías y productos, búsqueda por nombre o SKU, alerta de stock bajo, ajustes manuales de stock con motivo y bitácora |
| **Caja** | Carrito con búsqueda o escaneo de SKU, descuentos (porcentaje o monto), IVA incluido en el precio, recibo imprimible de 80 mm |
| **Usuarios** | Login con JWT; roles **Administrador** y **Cajero**; alta, cambio de rol, restablecer contraseña y desactivar usuarios |
| **Reportes** | Historial de ventas paginado, resumen por día o mes, productos más vendidos y dashboard |

El **cajero** solo ve la caja y sus propias ventas. El **administrador** ve todo.

## Inicio rápido (Docker)

```bash
cp .env.example .env   # cambia JWT_SECRET y ADMIN_PASSWORD
docker compose up -d --build
```

- Web: http://localhost:8080
- API: http://localhost:3000

Entra con `ADMIN_USERNAME` / `ADMIN_PASSWORD` del `.env`. El primer administrador se crea solo al arrancar con la base de datos vacía.

Si esos puertos están ocupados: `API_PORT=3098 WEB_PORT=8081 docker compose up -d --build`.

## Desarrollo

Requisitos: Node 24 y Docker.

```bash
cp .env.example .env
cp web/.env.example web/.env
docker compose up -d db        # solo PostgreSQL

npm install && npm run start:dev          # API en :3000
cd web && npm install && npm run dev      # web en :5173
```

### Datos de prueba

```bash
npm run seed                                     # solo si el catálogo está vacío
npm run seed -- --reset                          # reemplaza catálogo, ventas y ajustes
docker compose exec api node dist/seed --reset   # en la pila de Docker
```

Genera 7 categorías, 39 productos, los cajeros `cajero1` y `cajero2` (contraseña `cajero123`) y unos 90 días de ventas en horario de tienda, con descuentos ocasionales, reabastos y mermas registrados como ajustes, y algunos productos en stock bajo. Es determinista: siempre produce los mismos datos. Los usuarios existentes no se tocan.

### Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `PORT` | Puerto de la API |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y vigencia del token (ej. `8h`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Administrador inicial |
| `TAX_RATE` | Tasa de IVA (`0.16`) |
| `APP_TIMEZONE` | Zona horaria de la tienda para fechas y reportes (`America/Mexico_City`) |
| `CORS_ORIGIN` | Origen permitido para el frontend |
| `DB_LOGGING` | `true` imprime cada consulta SQL (apagado por defecto) |

En `web/.env`: `VITE_API_URL` es la URL de la API.

## Pruebas

El proyecto se desarrolló con **TDD**: cada criterio de aceptación tiene su test, escrito antes del código.

```bash
npm test            # unitarios de la API (cálculo de totales)
npm run test:e2e    # e2e de la API contra PostgreSQL real (requiere `docker compose up -d db`)
npm run lint
cd web && npm test  # cliente HTTP, carrito, dinero y menú por rol
```

Los e2e no simulan la base de datos: corren contra el Postgres de Docker, en su propia base `pos_test` (se crea sola), así que no tocan los datos del seed. Detalle de la estrategia de pruebas en [docs/TESTING.md](docs/TESTING.md).

## Decisiones técnicas

- **Dinero en centavos enteros.** Los precios viajan y se guardan como `int`; el frontend convierte pesos ↔ centavos sin errores de punto flotante.
- **Precios con IVA incluido.** El precio de mostrador es el que se cobra. El IVA se desglosa del total después del descuento.
- **Un solo cálculo de totales.** [`src/sales/totals.ts`](src/sales/totals.ts) no tiene dependencias. Lo usan el servidor y la vista previa del carrito, así que nunca muestran montos distintos. El servidor ignora los montos que envía el cliente.
- **Sin sobreventa.** La venta bloquea los productos (`SELECT … FOR UPDATE`), valida el stock y lo descuenta en una sola transacción. Si falta stock de un producto, se rechaza la venta completa (409). Un test e2e lanza ventas concurrentes para comprobarlo.
- **Histórico inmutable.** Cada línea de venta guarda el nombre y el precio del momento, y los productos se desactivan en lugar de borrarse.
- **Fechas en la zona de la tienda.** Los filtros y el agrupado por día usan `APP_TIMEZONE`: una venta a las 8 p.m. en México cuenta para ese día, aunque en UTC ya sea el siguiente.
- **Autorización global.** Un guard exige JWT en todo salvo lo marcado con `@Public()`, y `@Roles()` restringe por rol.

## API

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /auth/login` · `GET /auth/me` | público · todos | Login y usuario actual |
| `GET /categories` · `POST/PATCH/DELETE /categories/:id` | todos · admin | Categorías |
| `GET /products?q=&lowStock=true` · `GET /products/:id` | todos | Productos |
| `POST/PATCH/DELETE /products/:id` | admin | Alta, edición y baja lógica |
| `GET/POST /products/:id/stock-adjustments` | admin | Ajustes de stock |
| `POST /sales` · `GET /sales/:id` · `GET /sales?from&to&page&limit` | todos | Cobrar, recibo e historial (el cajero solo ve lo suyo) |
| `GET /sales/config` | todos | Tasa de IVA para la caja |
| `GET /reports/summary?from&to&groupBy=day\|month` | admin | Resumen de ventas |
| `GET /reports/top-products?from&to&limit` | admin | Productos más vendidos |
| `GET/POST /users` · `PATCH /users/:id` | admin | Usuarios |

## Estructura

```
src/            API (NestJS): auth, users, categories, products, sales, reports
test/           Pruebas e2e
web/src/        Frontend (React): páginas, carrito, cliente HTTP
docs/BACKLOG.md Product backlog, historias de usuario y criterios de aceptación
```

## Flujo de trabajo

- **Gitflow:** `main` (releases) ← `dev` ← `feature/US-XX-…`.
- **Conventional Commits**, con el ciclo TDD visible en el historial: `test(...)` seguido de `feat(...)`.
- El backlog con historias, criterios y decisiones está en [docs/BACKLOG.md](docs/BACKLOG.md).

## Limitaciones conocidas

- El esquema se crea con `synchronize` de TypeORM. Antes de producción hay que pasar a migraciones.
- El token se valida sin consultar la base de datos: un usuario desactivado conserva el acceso hasta que su token expira.
- Fuera del MVP: turnos y corte de caja, devoluciones, varias sucursales y facturación.
