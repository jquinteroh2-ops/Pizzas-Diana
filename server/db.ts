// Base de datos SQLite incluida en Node (node:sqlite). Un único archivo en disco
// (por defecto data/pizza-diana.db) que persiste entre reinicios del servidor.
// Todas las consultas usan parámetros (?) para evitar inyección SQL.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','empleado')),
  perms       TEXT NOT NULL DEFAULT '[]',
  pass_hash   TEXT,               -- NULL = no puede iniciar sesión (usuarios DEMO)
  active      INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  base_unit   TEXT NOT NULL CHECK (base_unit IN ('g','ml','unidad')),
  unit        TEXT NOT NULL,      -- unidad en la que se muestra (g, kg, ml, l, unidad)
  qty_m       INTEGER NOT NULL DEFAULT 0 CHECK (qty_m >= 0),
  min_m       INTEGER NOT NULL DEFAULT 0 CHECK (min_m >= 0),
  active      INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL CHECK (type IN ('preparado','directo')),
  active      INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  qty_m       INTEGER NOT NULL CHECK (qty_m > 0),
  unit        TEXT NOT NULL,
  PRIMARY KEY (product_id, item_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id          TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL UNIQUE,   -- evita registrar dos veces la misma venta
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  local_date  TEXT NOT NULL,          -- fecha en hora de Colombia, para reportes
  total_units INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada','anulada')),
  annulled_by INTEGER REFERENCES users(id),
  annulled_at TEXT,
  annul_reason TEXT,
  is_demo     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(local_date, status);

CREATE TABLE IF NOT EXISTS sale_items (
  sale_id      TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (sale_id, product_id)
);

-- Copia de la receta aplicada en el momento de la venta.
CREATE TABLE IF NOT EXISTS sale_consumption (
  sale_id     TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  item_name   TEXT NOT NULL,
  base_unit   TEXT NOT NULL,
  per_unit_m  INTEGER NOT NULL,
  total_m     INTEGER NOT NULL,
  PRIMARY KEY (sale_id, product_id, item_id)
);

CREATE TABLE IF NOT EXISTS movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  created_at  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('inicial','entrada','ajuste','venta','anulacion')),
  delta_m     INTEGER NOT NULL,
  after_m     INTEGER NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  user_id     INTEGER NOT NULL REFERENCES users(id),
  sale_id     TEXT REFERENCES sales(id) ON DELETE CASCADE,
  is_demo     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mov_item ON movements(item_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/**
 * Ejecuta fn dentro de una transacción. Si algo falla se revierte TODO
 * (no queda una venta sin descuentos ni descuentos sin venta).
 */
const depth = new WeakMap<DB, number>();

export function tx<T>(db: DB, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  // Dentro de otra transacción se usa un SAVEPOINT para poder revertir solo esa parte.
  const sp = `sp${d}`;
  db.exec(d === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const result = fn();
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return result;
  } catch (err) {
    db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  } finally {
    depth.set(db, d);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function isDemoMode(db: DB): boolean {
  return getSetting(db, 'demo_mode') === '1';
}
