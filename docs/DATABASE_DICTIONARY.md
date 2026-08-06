# Database Dictionary

SQLite (better-sqlite3). Pragmas: `journal_mode = WAL`, `foreign_keys = ON`,
`busy_timeout = 5000`, `synchronous = NORMAL`.
All `id` columns are TEXT (UUID or stable slug); timestamps are UTC ISO-8601
text; the business date is an `Asia/Manila` `YYYY-MM-DD` text value.
Money is INTEGER centavos.

## schema_migrations

| Column     | Type    | Notes                              |
| ---------- | ------- | ---------------------------------- |
| version    | TEXT PK | migration file name without `.sql` |
| name       | TEXT    | original file name                 |
| applied_at | TEXT    | UTC timestamp                      |

## categories

| Column                  | Type    | Notes                       |
| ----------------------- | ------- | --------------------------- |
| id                      | TEXT PK | stable slug (e.g. `snacks`) |
| name_en                 | TEXT    | English display name        |
| name_fil                | TEXT    | Filipino display name       |
| sort_order              | INTEGER | menu ordering               |
| created_at / updated_at | TEXT    | timestamps                  |

## products

| Column                           | Type                 | Notes                          |
| -------------------------------- | -------------------- | ------------------------------ |
| id                               | TEXT PK              | stable slug (e.g. `americano`) |
| category_id                      | TEXT FK → categories |                                |
| sku                              | TEXT UNIQUE          |                                |
| name                             | TEXT                 | never localized                |
| description_en / description_fil | TEXT                 | bilingual descriptions         |
| price_centavos                   | INTEGER ≥ 0          | base price                     |
| image_path                       | TEXT                 | placeholder asset path         |
| is_available                     | INTEGER 0/1          | availability toggle            |
| sort_order                       | INTEGER              | within category                |
| version                          | INTEGER default 1    | optimistic concurrency         |
| created_at / updated_at          | TEXT                 |                                |

## addons

| Column             | Type        | Notes                                    |
| ------------------ | ----------- | ---------------------------------------- |
| id                 | TEXT PK     | stable slug (e.g. `addon-espresso-shot`) |
| name_en / name_fil | TEXT        | bilingual names                          |
| price_centavos     | INTEGER ≥ 0 |                                          |
| sort_order         | INTEGER     |                                          |

## product_addons

Compatibility matrix (provisional — see MENU_VALIDATION.md).

| Column     | Type                             |
| ---------- | -------------------------------- |
| product_id | TEXT PK, FK → products (CASCADE) |
| addon_id   | TEXT PK, FK → addons (CASCADE)   |

## product_option_groups

| Column                  | Type                         | Notes                |
| ----------------------- | ---------------------------- | -------------------- |
| id                      | TEXT PK                      | `{product}__{group}` |
| product_id              | TEXT FK → products (CASCADE) |                      |
| name_en / name_fil      | TEXT                         |                      |
| is_required             | INTEGER 0/1                  |                      |
| min_select / max_select | INTEGER                      | fries flavor: 1/1    |
| sort_order              | INTEGER                      |                      |

## product_options

| Column             | Type                                      | Notes                  |
| ------------------ | ----------------------------------------- | ---------------------- |
| id                 | TEXT PK                                   | `{group}__{option}`    |
| group_id           | TEXT FK → product_option_groups (CASCADE) |                        |
| name_en / name_fil | TEXT                                      |                        |
| price_centavos     | INTEGER default 0                         | fries flavors are free |
| sort_order         | INTEGER                                   |                        |

## orders

| Column                      | Type              | Notes                                         |
| --------------------------- | ----------------- | --------------------------------------------- |
| id                          | TEXT PK           | UUID                                          |
| order_number                | TEXT UNIQUE       | `SG-YYYYMMDD-NNN`                             |
| business_date               | TEXT              | Manila `YYYY-MM-DD`                           |
| daily_sequence              | INTEGER           | per business date                             |
| status                      | TEXT              | placed/preparing/ready/completed/cancelled    |
| payment_method              | TEXT              | cash / demo_wallet                            |
| payment_status              | TEXT              | pending_cash / cash_received / demo_confirmed |
| locale                      | TEXT              | en / fil (session language)                   |
| subtotal_centavos           | INTEGER           |                                               |
| total_centavos              | INTEGER           | = subtotal (no taxes/promos)                  |
| idempotency_key             | TEXT UNIQUE       | submission dedupe                             |
| receipt_token_hash          | TEXT              | SHA-256 of the opaque receipt token           |
| version                     | INTEGER default 1 | optimistic concurrency                        |
| created_at / updated_at     | TEXT              |                                               |
| completed_at / cancelled_at | TEXT NULL         | set on transitions                            |

Constraints: `UNIQUE(order_number)`, `UNIQUE(business_date, daily_sequence)`,
`UNIQUE(idempotency_key)`, CHECKs on status/payment values.

## order_items (snapshots)

| Column              | Type                       | Notes                                        |
| ------------------- | -------------------------- | -------------------------------------------- |
| id                  | TEXT PK                    | UUID                                         |
| order_id            | TEXT FK → orders (CASCADE) |                                              |
| product_id          | TEXT                       | snapshot (no FK — survives menu edits)       |
| product_sku         | TEXT                       | snapshot                                     |
| product_name        | TEXT                       | snapshot                                     |
| unit_price_centavos | INTEGER                    | snapshot (base + add-ons + options per unit) |
| quantity            | INTEGER > 0                |                                              |
| line_total_centavos | INTEGER                    | unit × quantity                              |
| sort_order          | INTEGER                    | line position                                |

## order_item_addons (snapshots)

| Column               | Type                            | Notes    |
| -------------------- | ------------------------------- | -------- |
| id                   | TEXT PK                         |          |
| order_item_id        | TEXT FK → order_items (CASCADE) |          |
| addon_id             | TEXT                            | snapshot |
| addon_name           | TEXT                            | snapshot |
| addon_price_centavos | INTEGER                         | snapshot |

## order_item_options (snapshots)

| Column                | Type                            | Notes    |
| --------------------- | ------------------------------- | -------- |
| id                    | TEXT PK                         |          |
| order_item_id         | TEXT FK → order_items (CASCADE) |          |
| option_id             | TEXT                            | snapshot |
| option_name           | TEXT                            | snapshot |
| option_price_centavos | INTEGER                         | snapshot |

## admins

| Column                  | Type              | Notes                   |
| ----------------------- | ----------------- | ----------------------- |
| id                      | TEXT PK           | UUID                    |
| username                | TEXT UNIQUE       | case-insensitive lookup |
| password_hash           | TEXT              | bcrypt (12 rounds)      |
| is_active               | INTEGER default 1 |                         |
| created_at / updated_at | TEXT              |                         |

## admin_sessions

| Column | Type    | Notes                                                     |
| ------ | ------- | --------------------------------------------------------- |
| sid    | TEXT PK | express-session id                                        |
| sess   | TEXT    | session JSON (includes `absExpiresAt` for the 8-hour cap) |
| expire | INTEGER | epoch ms cookie expiry (pruning)                          |

## audit_events

| Column                     | Type      | Notes                                                                                                                  |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| id                         | TEXT PK   | UUID                                                                                                                   |
| actor                      | TEXT      | admin username or `kiosk`/`system`                                                                                     |
| action                     | TEXT      | e.g. ADMIN_LOGIN_SUCCESS, CASH_CONFIRMED, ORDER_STATUS_CHANGED, ORDER_CANCELLED, AVAILABILITY_CHANGED, BACKUP, RESTORE |
| target_type / target_id    | TEXT NULL | entity reference                                                                                                       |
| previous_state / new_state | TEXT NULL | JSON strings                                                                                                           |
| request_id                 | TEXT NULL | correlation                                                                                                            |
| ip                         | TEXT NULL | local device/IP info                                                                                                   |
| user_agent                 | TEXT NULL |                                                                                                                        |
| created_at                 | TEXT      |                                                                                                                        |

Never stored: passwords, session IDs, CSRF tokens, receipt tokens.

## Indexes

`idx_products_category`, `idx_option_groups_product`, `idx_options_group`,
`idx_orders_business_date`, `idx_orders_status`, `idx_orders_payment_status`,
`idx_order_items_order`, `idx_order_item_addons_item`,
`idx_order_item_options_item`, `idx_admin_sessions_expire`,
`idx_audit_created_at`.
