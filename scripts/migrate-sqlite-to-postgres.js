import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { openPostgres } from '../apps/server/src/db/postgres.js';
import { runPostgresMigrations } from '../apps/server/src/db/postgres-migrate.js';

const replaceExisting = process.argv.includes('--replace');
const env = loadEnv();
if (env.databaseProvider !== 'postgres') {
  throw new Error('Set DATABASE_PROVIDER=postgres before running the import.');
}

const source = openDb(env.dbPath);
const integrity = source.pragma('integrity_check', { simple: true });
if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);

const backupName = `kiosk-before-postgres-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
const backupPath = path.resolve(path.dirname(env.dbPath), '..', 'backups', backupName);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
await source.backup(backupPath);

const target = openPostgres(env);
try {
  await runPostgresMigrations(target);
  const hasRows = await target.one('SELECT EXISTS (SELECT 1 FROM categories) AS present');
  if (hasRows.present && !replaceExisting) {
    throw new Error(
      'Target already contains catalog data. Re-run with --replace only after verifying the target backup.',
    );
  }

  const rows = (table) => source.prepare(`SELECT * FROM ${table}`).all();
  const categories = rows('categories');
  const addons = rows('addons');
  const products = rows('products');
  const productAddons = rows('product_addons');
  const groups = rows('product_option_groups');
  const options = rows('product_options');
  const admins = rows('admins');
  const orders = rows('orders');
  const orderItems = rows('order_items');
  const orderAddons = rows('order_item_addons');
  const orderOptions = rows('order_item_options');
  const audits = rows('audit_events');

  await target.transaction(async (tx) => {
    if (replaceExisting) {
      await tx.exec(`TRUNCATE TABLE
        audit_events, order_item_options, order_item_addons, order_items, orders,
        admin_sessions, admins, product_options, product_option_groups, product_addons,
        products, addons, categories, daily_order_sequences CASCADE`);
    }
    for (const row of categories)
      await tx.query(
        'INSERT INTO categories (id, name_en, name_fil, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz)',
        [row.id, row.name_en, row.name_fil, row.sort_order, row.created_at, row.updated_at],
      );
    for (const row of addons)
      await tx.query(
        'INSERT INTO addons (id, name_en, name_fil, price_centavos, sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6::timestamptz)',
        [row.id, row.name_en, row.name_fil, row.price_centavos, row.sort_order, row.created_at],
      );
    for (const row of products)
      await tx.query(
        'INSERT INTO products (id, category_id, sku, name, description_en, description_fil, price_centavos, image_path, is_available, is_published, sort_order, version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz)',
        [
          row.id,
          row.category_id,
          row.sku,
          row.name,
          row.description_en,
          row.description_fil,
          row.price_centavos,
          row.image_path,
          Boolean(row.is_available),
          Boolean(row.is_published ?? 1),
          row.sort_order,
          row.version,
          row.created_at,
          row.updated_at,
        ],
      );
    for (const row of productAddons)
      await tx.query('INSERT INTO product_addons (product_id, addon_id) VALUES ($1,$2)', [
        row.product_id,
        row.addon_id,
      ]);
    for (const row of groups)
      await tx.query(
        'INSERT INTO product_option_groups (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          row.id,
          row.product_id,
          row.name_en,
          row.name_fil,
          Boolean(row.is_required),
          row.min_select,
          row.max_select,
          row.sort_order,
        ],
      );
    for (const row of options)
      await tx.query(
        'INSERT INTO product_options (id, group_id, name_en, name_fil, price_centavos, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.id, row.group_id, row.name_en, row.name_fil, row.price_centavos, row.sort_order],
      );
    for (const row of admins)
      await tx.query(
        'INSERT INTO admins (id, username, password_hash, role, is_active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz)',
        [
          row.id,
          row.username,
          row.password_hash,
          row.role || 'admin',
          Boolean(row.is_active),
          row.created_at,
          row.updated_at,
        ],
      );
    for (const row of orders)
      await tx.query(
        'INSERT INTO orders (id, order_number, business_date, daily_sequence, status, payment_method, payment_status, locale, subtotal_centavos, total_centavos, idempotency_key, receipt_token_hash, version, deployment_id, created_at, updated_at, preparing_at, payment_confirmed_at, ready_at, completed_at, cancelled_at) VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz,$16::timestamptz,$17::timestamptz,$18::timestamptz,$19::timestamptz,$20::timestamptz,$21::timestamptz)',
        [
          row.id,
          row.order_number,
          row.business_date,
          row.daily_sequence,
          row.status,
          row.payment_method,
          row.payment_status,
          row.locale,
          row.subtotal_centavos,
          row.total_centavos,
          row.idempotency_key,
          row.receipt_token_hash,
          row.version,
          row.deployment_id || 'local-legacy',
          row.created_at,
          row.updated_at,
          row.preparing_at,
          row.payment_confirmed_at,
          row.ready_at,
          row.completed_at,
          row.cancelled_at,
        ],
      );
    for (const row of orderItems)
      await tx.query(
        'INSERT INTO order_items (id, order_id, product_id, product_sku, product_name, unit_price_centavos, quantity, line_total_centavos, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          row.id,
          row.order_id,
          row.product_id,
          row.product_sku,
          row.product_name,
          row.unit_price_centavos,
          row.quantity,
          row.line_total_centavos,
          row.sort_order,
        ],
      );
    for (const row of orderAddons)
      await tx.query(
        'INSERT INTO order_item_addons (id, order_item_id, addon_id, addon_name, addon_price_centavos) VALUES ($1,$2,$3,$4,$5)',
        [row.id, row.order_item_id, row.addon_id, row.addon_name, row.addon_price_centavos],
      );
    for (const row of orderOptions)
      await tx.query(
        'INSERT INTO order_item_options (id, order_item_id, option_id, option_name, option_price_centavos) VALUES ($1,$2,$3,$4,$5)',
        [row.id, row.order_item_id, row.option_id, row.option_name, row.option_price_centavos],
      );
    for (const row of audits)
      await tx.query(
        'INSERT INTO audit_events (id, actor, actor_role, action, target_type, target_id, previous_state, new_state, request_id, ip, user_agent, deployment_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13::timestamptz)',
        [
          row.id,
          row.actor,
          row.actor_role || null,
          row.action,
          row.target_type,
          row.target_id,
          row.previous_state,
          row.new_state,
          row.request_id,
          row.ip,
          row.user_agent,
          'local-legacy',
          row.created_at,
        ],
      );
    await tx.query(`INSERT INTO daily_order_sequences (business_date, last_value)
      SELECT business_date, MAX(daily_sequence) FROM orders GROUP BY business_date
      ON CONFLICT (business_date) DO UPDATE SET last_value = GREATEST(daily_order_sequences.last_value, EXCLUDED.last_value)`);
  });

  const expected = {
    categories: categories.length,
    addons: addons.length,
    products: products.length,
    orders: orders.length,
    orderItems: orderItems.length,
    audits: audits.length,
  };
  const actual = {
    categories: (await target.one('SELECT COUNT(*)::int AS n FROM categories')).n,
    addons: (await target.one('SELECT COUNT(*)::int AS n FROM addons')).n,
    products: (await target.one('SELECT COUNT(*)::int AS n FROM products')).n,
    orders: (await target.one('SELECT COUNT(*)::int AS n FROM orders')).n,
    orderItems: (await target.one('SELECT COUNT(*)::int AS n FROM order_items')).n,
    audits: (await target.one('SELECT COUNT(*)::int AS n FROM audit_events')).n,
  };
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(
      `Reconciliation failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  const sourceTotals = source
    .prepare(
      "SELECT COALESCE(SUM(total_centavos),0) AS total FROM orders WHERE status = 'completed'",
    )
    .get().total;
  const targetTotals = (
    await target.one(
      "SELECT COALESCE(SUM(total_centavos),0)::int AS total FROM orders WHERE status = 'completed'",
    )
  ).total;
  if (sourceTotals !== targetTotals)
    throw new Error(`Completed-sales reconciliation failed: ${sourceTotals} != ${targetTotals}`);
  console.log(
    JSON.stringify({ backupPath, expected, actual, completedSalesCentavos: targetTotals }, null, 2),
  );
} finally {
  source.close();
  await target.close();
}
