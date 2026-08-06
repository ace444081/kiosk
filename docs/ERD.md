# Entity-Relationship Diagram

## ERD

```mermaid
erDiagram
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ PRODUCT_ADDONS : "compatible with"
    ADDONS ||--o{ PRODUCT_ADDONS : "compatible with"
    PRODUCTS ||--o{ PRODUCT_OPTION_GROUPS : has
    PRODUCT_OPTION_GROUPS ||--o{ PRODUCT_OPTIONS : contains

    ORDERS ||--o{ ORDER_ITEMS : contains
    ORDER_ITEMS ||--o{ ORDER_ITEM_ADDONS : "snapshot add-ons"
    ORDER_ITEMS ||--o{ ORDER_ITEM_OPTIONS : "snapshot options"

    ADMINS ||--o{ ADMIN_SESSIONS : "owns sessions"
    AUDIT_EVENTS }o--|| "*" : "references any entity"

    CATEGORIES {
        text id PK
        text name_en
        text name_fil
        int sort_order
    }
    PRODUCTS {
        text id PK
        text category_id FK
        text sku UK
        text name
        text description_en
        text description_fil
        int price_centavos
        text image_path
        int is_available
        int sort_order
        int version
        text created_at
        text updated_at
    }
    ADDONS {
        text id PK
        text name_en
        text name_fil
        int price_centavos
        int sort_order
    }
    PRODUCT_ADDONS {
        text product_id PK,FK
        text addon_id PK,FK
    }
    PRODUCT_OPTION_GROUPS {
        text id PK
        text product_id FK
        text name_en
        text name_fil
        int is_required
        int min_select
        int max_select
        int sort_order
    }
    PRODUCT_OPTIONS {
        text id PK
        text group_id FK
        text name_en
        text name_fil
        int price_centavos
        int sort_order
    }
    ORDERS {
        text id PK
        text order_number UK
        text business_date
        int daily_sequence
        text status
        text payment_method
        text payment_status
        text locale
        int subtotal_centavos
        int total_centavos
        text idempotency_key UK
        text receipt_token_hash
        int version
        text created_at
        text updated_at
        text completed_at
        text cancelled_at
        "UNIQUE(business_date, daily_sequence)"
    }
    ORDER_ITEMS {
        text id PK
        text order_id FK
        text product_id
        text product_sku
        text product_name
        int unit_price_centavos
        int quantity
        int line_total_centavos
        int sort_order
    }
    ORDER_ITEM_ADDONS {
        text id PK
        text order_item_id FK
        text addon_id
        text addon_name
        int addon_price_centavos
    }
    ORDER_ITEM_OPTIONS {
        text id PK
        text order_item_id FK
        text option_id
        text option_name
        int option_price_centavos
    }
    ADMINS {
        text id PK
        text username UK
        text password_hash
        int is_active
        text created_at
        text updated_at
    }
    ADMIN_SESSIONS {
        text sid PK
        text sess
        int expire
    }
    AUDIT_EVENTS {
        text id PK
        text actor
        text action
        text target_type
        text target_id
        text previous_state
        text new_state
        text request_id
        text ip
        text user_agent
        text created_at
    }
    SCHEMA_MIGRATIONS {
        text version PK
        text name
        text applied_at
    }
```

## Notes

- **Products/Add-ons/Options** keep `*_en` / `*_fil` display names; product
  names are intentionally single-language (never translated).
- **Order item snapshots** (name, SKU, unit price, add-on/option names and
  prices) guarantee historical receipts do not change after menu edits.
- **Money** is stored as integer centavos everywhere.
- **Orders** enforce:
  - `UNIQUE(order_number)`
  - `UNIQUE(business_date, daily_sequence)`
  - `UNIQUE(idempotency_key)`
- **admin_sessions** stores the express-session JSON; `expire` mirrors the
  cookie expiry for pruning; the session payload also carries the absolute
  8-hour deadline.
- **audit_events** stores JSON strings for previous/new state; never stores
  passwords, session IDs, CSRF tokens, or receipt tokens.
- **schema_migrations** is managed by the migration runner
  (`apps/server/src/db/migrate.js`); migrations live in
  `apps/server/src/db/migrations/`.

See DATABASE_DICTIONARY.md for column-level details and types.
