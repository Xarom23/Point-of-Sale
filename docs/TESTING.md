# Estrategia de pruebas

Complementa la sección "Enfoque TDD" de [BACKLOG.md](BACKLOG.md). Las suites por historia prueban los criterios de aceptación. Las suites transversales prueban lo que ninguna historia dice pero un sistema expuesto necesita: entradas hostiles, permisos, concurrencia y estabilidad del contrato.

## Cómo correrlas

```bash
docker compose up -d db
npm test               # unitarias de la API
npm run test:e2e       # e2e contra Postgres real
cd web && npm test     # lógica del frontend
```

Los e2e usan su propia base, `pos_test`:

- `test/global-setup.ts` la crea si no existe.
- `vitest.config.e2e.ts` apunta `DB_NAME` a ella.
- Los datos de desarrollo y del seed (`pos_db`) no se tocan.

Cada archivo levanta la app completa y limpia sus tablas en `beforeEach`. Por eso las pruebas son independientes, se pueden repetir y corren en serie (`fileParallelism: false`).

**Helpers** (`test/helpers.ts`):

| Helper | Qué hace |
|---|---|
| `createTestApp(controllers?)` | Levanta la app con clientes `http('admin' \| 'cashier')` cuyos tokens pertenecen a usuarios reales |
| `resetCatalog(n, overrides)` | Deja la categoría 1 y `n` productos |
| `resetUsers()` | Borra todos los usuarios salvo el admin y el cajero de prueba |
| `sign(user)` | Firma un JWT para cualquier usuario |

## Suites transversales

| Suite | Cubre |
|---|---|
| `test/access-control.e2e-spec.ts` | Matriz de las 23 rutas × anónimo/cajero/admin. JWT forjados (expirado, `nbf`, payload alterado, `alg: none`, otro secreto, malformado). Revocación inmediata al desactivar o degradar. Credenciales mal ubicadas (query, cookie: sin superficie CSRF). Headers de 20 KB → 431. IDOR en ventas |
| `test/auth.e2e-spec.ts` (bloque *brute-force*) | 5 intentos de login por minuto por IP + usuario → 429. `X-Forwarded-For` no lo evade |
| `test/input-validation.e2e-spec.ts` | Campos faltantes, `null` y con tipo incorrecto (generados por DTO). Límites exactos: longitudes, 0, int4. Unicode y emoji. Bytes nulos. Inyección SQL en body, query, path y login. XSS almacenado. Mass assignment y `__proto__`. Body > 100 KB → 413. Carrito de 201 líneas. JSON malformado. Ráfagas de 100 lecturas y 50 escrituras inválidas |
| `test/pagination-filters.e2e-spec.ts` | Recorre todas las páginas de 45 ventas (20 con el mismo `createdAt`): sin duplicados ni huecos, orden estable con cualquier tamaño de página. Rango de fechas y alcance del cajero combinados. Parámetros inválidos y vacíos. Combinaciones de `q` y `lowStock`, comodines literales. Filtros y límites de reportes |
| `test/idempotency-consistency.e2e-spec.ts` | PATCH y DELETE repetidos. Duplicados secuenciales y concurrentes. Reintento de venta. Ajustes y ventas compitiendo por las mismas unidades. Invariante de stock. CRUD que relee lo escrito. Base caída → 500 sin fugas |
| `test/contracts.e2e-spec.ts` + `test/contracts.ts` | La forma de cada respuesta y del sobre de error (ver abajo) |
| `src/common/db-exception.filter.spec.ts` | Código de error de Postgres → status HTTP |
| `src/sales/totals.spec.ts` | Además de los casos de US-10: 0 %, 100 % e invariantes enteras sobre una malla de precios, cantidades, descuentos y tasas |

`web/.oxlintrc.json` prohíbe `dangerouslySetInnerHTML` y las URLs `javascript:`. La API guarda los textos tal cual, así que la protección contra XSS depende de que React los escape.

### Contratos

`test/contracts.ts` describe cada respuesta con matchers de Vitest. Funciona como un JSON Schema, sin dependencias nuevas. La suite compara con `toEqual`:

- Si se quita, renombra o cambia de tipo un campo, la prueba falla. Eso es un cambio incompatible para `web/`.
- Si se agrega un campo, también falla, y hay que agregarlo al contrato a propósito.

## Trazabilidad: historia → pruebas

| Historia | Pruebas |
|---|---|
| US-01 Backend + Postgres | `app.e2e-spec.ts` (conexión), `global-setup.ts` |
| US-02 Frontend | `web/src/lib/api.test.ts` (cliente HTTP, 401 → login) |
| US-03 Login | `auth.e2e-spec.ts` (incluye el rate limit), `contracts.e2e-spec.ts` (sin hash), `input-validation.e2e-spec.ts` (inyección y cuerpos inválidos en login) |
| US-04 Autorización por rol | `roles.e2e-spec.ts`, `access-control.e2e-spec.ts`, `web/src/nav.test.ts` |
| US-05 Usuarios | `users.e2e-spec.ts`, `access-control.e2e-spec.ts` (desactivar o degradar revoca el token), `idempotency-consistency.e2e-spec.ts` |
| US-06 Categorías | `categories.e2e-spec.ts`, `idempotency-consistency.e2e-spec.ts` (duplicados concurrentes, DELETE repetido) |
| US-07 Productos | `products.e2e-spec.ts`, `input-validation.e2e-spec.ts` (límites, mass assignment), `pagination-filters.e2e-spec.ts` (`?q=`) |
| US-08 Stock bajo | `products.e2e-spec.ts`, `pagination-filters.e2e-spec.ts` (`lowStock` combinado e inválido) |
| US-09 Ajuste de stock | `stock.e2e-spec.ts`, `idempotency-consistency.e2e-spec.ts` (ajustes concurrentes, invariante) |
| US-10 Registrar venta | `sales.e2e-spec.ts`, `totals.spec.ts`, `input-validation.e2e-spec.ts` (descuento ≤ 100 %, ≤ 200 líneas), `idempotency-consistency.e2e-spec.ts` (carreras venta/ajuste) |
| US-11 Pantalla de caja | `web/src/cart.test.ts` |
| US-12 Recibo | `sales.e2e-spec.ts`, `contracts.e2e-spec.ts` (`GET /sales/:id`) |
| US-13 Historial | `history.e2e-spec.ts`, `pagination-filters.e2e-spec.ts`, `access-control.e2e-spec.ts` (IDOR) |
| US-14 Resumen | `reports.e2e-spec.ts`, `pagination-filters.e2e-spec.ts` |
| US-15 Más vendidos | `reports.e2e-spec.ts`, `pagination-filters.e2e-spec.ts` |
| US-16 Dashboard | Consume los endpoints de US-08, US-14 y US-15, ya cubiertos con su contrato. No hay prueba de UI |

No hay E2E de navegador: es una decisión tomada. La UI se cubre con pruebas de su lógica pura (`web/src/**/*.test.ts`).

## Defectos que encontraron estas pruebas

Cada uno tiene en git su commit `test(...)` en rojo seguido del `fix(...)`.

| Defecto | Corrección |
|---|---|
| Un id o monto mayor que int4, o un `\0`, devolvía 500 (también `?page=1e20`) | `DbExceptionFilter`: la clase SQLSTATE 22 → 400 |
| Un usuario desactivado o degradado conservaba su acceso hasta que expiraba el JWT (8 h) | El guard consulta al usuario activo y toma su rol de la base |
| El login admitía intentos ilimitados | `@nestjs/throttler` solo en `POST /auth/login` |
| Un descuento de 150 % se aceptaba (y se recortaba a 100 %) | 400 si el porcentaje pasa de 100 |
| Un carrito sin tope de líneas (miles caben en 100 KB) | `@ArrayMaxSize(200)` |
| `?q=%` o `?q=_` devolvían todo el catálogo | Se escapan los comodines de `ILIKE` |
| `?lowStock=yes` y `?q=` repetido se aceptaban sin aviso | `ProductsQueryDto` |
| Los e2e borraban el seed de desarrollo | Base `pos_test` aislada |

## Limitaciones conocidas

Están documentadas en las pruebas, no corregidas:

- **`POST /sales` no es idempotente.** Un reintento del cliente registra una segunda venta. La web nunca reintenta un cobro. Si algún día lo hiciera, agregar un header `Idempotency-Key`.
- **Solo `/sales` está paginado.** Las demás listas son catálogos pequeños y `web/` espera arreglos. Paginarlas cambiaría el contrato.
- **Las claves únicas distinguen mayúsculas.** `General` y `general` son categorías distintas.
- **Se aceptan nombres hechos solo de espacios.** `@IsNotEmpty` no recorta el texto.
- **El rate limit vive en la memoria del proceso.** Si la API corre en varias instancias, hay que moverlo a un store compartido.
