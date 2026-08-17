# API Reference

Base path: `/api/v1`

All responses use the error envelope on failure:

```json
{
  "error": {
    "code": "PRODUCT_UNAVAILABLE",
    "message": "Stable English developer message",
    "fieldErrors": {}
  },
  "requestId": "request-id"
}
```

The UI localizes by the stable `code` (see `packages/shared/src/errors.js`).

## Public endpoints

### `GET /api/v1/menu?locale=en|fil`

Cacheable: `Cache-Control: public, max-age=5` (PWA stores the latest copy for offline display).

```json
{
  "locale": "en",
  "generatedAt": "ISO-8601",
  "categories": [
    {
      "id": "snacks",
      "name": "Snacks",
      "sortOrder": 2,
      "products": [
        {
          "id": "crinkled-fries",
          "sku": "crinkled-fries",
          "name": "Crinkled Fries",
          "description": "Seasoned crinkled fries with your choice of flavor.",
          "priceCentavos": 6500,
          "imagePath": "/placeholders/products/crinkled-fries.svg",
          "isAvailable": true,
          "version": 1,
          "addons": [],
          "optionGroups": [
            {
              "id": "crinkled-fries__fries-flavor",
              "name": "Flavor",
              "isRequired": true,
              "minSelect": 1,
              "maxSelect": 1,
              "options": [
                {
                  "id": "crinkled-fries__fries-flavor__fries-cheese",
                  "name": "Cheese",
                  "priceCentavos": 0
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### `POST /api/v1/orders`

Requires header `Idempotency-Key` (8–128 chars of `[A-Za-z0-9_-]`).
Client prices are ignored; the server loads current catalog data, validates,
prices, snapshots, and commits atomically.

Request:

```json
{
  "locale": "en",
  "paymentMethod": "cash",
  "items": [{ "productId": "uuid-or-stable-id", "quantity": 1, "addonIds": [], "optionIds": [] }]
}
```

`paymentMethod`: `cash` | `demo_wallet`.

Responses:

- `201 Created` — new order:

```json
{
  "id": "...",
  "orderNumber": "SG-20260806-001",
  "businessDate": "2026-08-06",
  "dailySequence": 1,
  "status": "placed",
  "paymentMethod": "cash",
  "paymentStatus": "pending_cash",
  "locale": "en",
  "subtotalCentavos": 6500,
  "totalCentavos": 6500,
  "version": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "completedAt": null,
  "cancelledAt": null,
  "receiptToken": "opaque-token-returned-once",
  "duplicate": false,
  "items": [
    {
      "productId": "hashbrown-2pc",
      "productSku": "hashbrown-2pc",
      "productName": "2pc. Hashbrown",
      "unitPriceCentavos": 6500,
      "quantity": 1,
      "lineTotalCentavos": 6500,
      "addons": [],
      "options": []
    }
  ]
}
```

- `200 OK` — duplicate idempotency key: same body with `duplicate: true`
  and `receiptToken: null` (the token cannot be re-issued; only its hash is
  stored).

Validation failures return `400` with `fieldErrors` keys such as
`items.0.productId: PRODUCT_UNAVAILABLE`, `items.0.addonIds:
ADDON_INCOMPATIBLE`, `items.0.optionIds: REQUIRED_OPTIONS`.

### `GET /api/v1/orders/:orderNumber/receipt?token=...`

Private receipt. Only the token hash is stored, so wrong tokens and missing
receipts are indistinguishable: `404 INVALID_RECEIPT_TOKEN`. Response body:
`{ "receipt": { ...order fields..., "items": [...] } }`.
`Cache-Control: no-store`.

### `GET /api/v1/health`

```json
{ "status": "ok", "time": "ISO-8601", "db": "ok", "dbError": null, "uptimeSeconds": 123 }
```

## Admin endpoints

Admin management endpoints below require an authenticated account whose role
is `admin`. A valid session alone is not enough.

## Staff station endpoints

All station responses use `Cache-Control: no-store`. Mutations require the
session CSRF token and current order `version`.

| Method | Path                               | Roles                | Purpose                                                       |
| ------ | ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| POST   | `/api/v1/staff/session`            | Public               | Staff/admin login; returns username, role, CSRF token, expiry |
| GET    | `/api/v1/staff/session`            | Any staff            | Resolve the current account and role                          |
| DELETE | `/api/v1/staff/session`            | Any staff            | Sign out                                                      |
| GET    | `/api/v1/staff/queue/cashier`      | Cashier, admin       | Pending cash and brief recently-confirmed handoff queue       |
| GET    | `/api/v1/staff/queue/kitchen`      | Kitchen, admin       | Paid placed orders and preparing orders                       |
| GET    | `/api/v1/staff/queue/serving`      | Serving, admin       | Ready orders and 60-second completed history                  |
| PATCH  | `/api/v1/staff/orders/:id/payment` | Cashier, admin       | Confirm cash before preparation                               |
| PATCH  | `/api/v1/staff/orders/:id/status`  | Station owner, admin | Role-checked workflow transition                              |
| GET    | `/api/v1/staff/events`             | Any staff            | Refresh-only live event stream                                |

Public customer-display endpoints expose no items, totals, payment details, or
staff identity:

| Method | Path                          | Purpose                                                            |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/orders/board`        | Anonymous order numbers classified as `preparing` or `now_serving` |
| GET    | `/api/v1/orders/board/events` | Refresh-only public live event stream                              |

All admin endpoints set `Cache-Control: no-store`. Mutations require the
session cookie AND the `X-CSRF-Token` header (issued at login).

### `POST /api/v1/admin/session`

Body: `{ "username": "...", "password": "..." }`.

- 200: `{ "authenticated": true, "username": "...", "csrfToken": "...", "expiresAt": "ISO-8601" }`
- 401: generic `INVALID_CREDENTIALS`
- 429: `RATE_LIMITED` with `Retry-After` (5 failed attempts per IP+username
  per 15 min; success resets the counter)

### `GET /api/v1/admin/session`

- 200: same shape as login (authenticated)
- 401: not authenticated

### `DELETE /api/v1/admin/session`

Logs out, destroys the session. `204 No Content`.

### `GET /api/v1/admin/orders`

Query params (all optional, combined with AND):

- `status` — placed | preparing | ready | completed | cancelled
- `payment` — pending_cash | cash_received | demo_confirmed
- `date` — `YYYY-MM-DD` (business date)
- `search` — exact order number (case-insensitive)

Response: `{ "orders": [ { id, orderNumber, businessDate, dailySequence,
status, paymentMethod, paymentStatus, locale, totalCentavos, version,
createdAt, updatedAt } ] }` — newest first, max 200.

### `GET /api/v1/admin/orders/:id`

`{ "order": { ...fields, "items": [ { ..., addons: [...], options: [...] } ] } }`

### `PATCH /api/v1/admin/orders/:id/status`

Body: `{ "status": "preparing", "version": 1 }`

- 200: `{ "order": { ...newest order... } }`
- 409: `STALE_VERSION` | `INVALID_TRANSITION` | `PAYMENT_NOT_CONFIRMED` —
  body also carries `order` (newest state)

### `PATCH /api/v1/admin/orders/:id/payment`

Body: `{ "paymentStatus": "cash_received", "version": 1 }` (cash orders only).

- 200 / 409 (`STALE_VERSION`, `INVALID_PAYMENT_STATE`)

### `GET /api/v1/admin/products`

Query params: `search`, `category`, `availability` (`available`|`sold_out`|`all`).
Response: `{ "products": [ { id, sku, name, categoryId, categoryName,
priceCentavos, imagePath, isAvailable, version, updatedAt } ] }`

### `PATCH /api/v1/admin/products/:id/availability`

Body: `{ "isAvailable": false, "version": 1 }`

- 200: `{ "product": { id, isAvailable, version, updatedAt } }`
- 409: `STALE_VERSION` (with the current product)
- 404: `PRODUCT_NOT_FOUND`

### `GET /api/v1/admin/summary`

```json
{
  "summary": {
    "businessDate": "2026-08-06",
    "totalOrders": 12,
    "pendingCash": 3,
    "placed": 4,
    "preparing": 2,
    "ready": 1,
    "completed": 4,
    "cancelled": 1,
    "completedSalesCentavos": 45000,
    "completedSalesCashCentavos": 30000,
    "completedSalesDemoCentavos": 15000
  },
  "connection": { "status": "ok", "serverTime": "ISO-8601", "db": "ok" }
}
```

Only completed orders with `cash_received` or `demo_confirmed` count toward
completed sales. Demo amounts are simulated.

### `GET /api/v1/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns the selected business-date range for the Operations and Sales
dashboard. The response includes the period summary, daily activity, workflow
mix, payment mix, top products, service-time averages, and data coverage.
Real cash and simulated demo-wallet amounts are separate fields.

### `GET /api/v1/admin/events`

Server-sent events (`text/event-stream`). Replays the recent backlog on
connect, then streams live events. Event types: `OrderCreated`,
`OrderUpdated`, `AvailabilityChanged`. Heartbeat comments every 15 s.
The admin UI falls back to 5-second polling when SSE fails.

## Error codes

`VALIDATION_ERROR`, `EMPTY_CART`, `PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`,
`ADDON_NOT_FOUND`, `ADDON_INCOMPATIBLE`, `OPTION_NOT_FOUND`,
`REQUIRED_OPTIONS`, `OPTION_LIMIT`, `QUANTITY_OUT_OF_RANGE`,
`IDEMPOTENCY_KEY_MISSING`, `ORDER_NOT_FOUND`, `INVALID_RECEIPT_TOKEN`,
`UNAUTHORIZED`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `SESSION_EXPIRED`,
`CSRF_INVALID`, `STALE_VERSION`, `INVALID_TRANSITION`,
`INVALID_PAYMENT_STATE`, `PAYMENT_NOT_CONFIRMED`, `NOT_FOUND`,
`INTERNAL_ERROR`, `BAD_REQUEST`.
