// Base de datos SQLite incluida en Node (node:sqlite). Un único archivo en disco
// (por defecto data/pizza-diana.db) que persiste entre reinicios del servidor.
// Todas las consultas usan parámetros (?) para evitar inyección SQL.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

// Columnas de cocina de items. Están aparte porque la migración 1 las agrega a bases viejas.
const ITEM_COLUMNS = [
  "kind        TEXT NOT NULL DEFAULT 'insumo' CHECK (kind IN ('insumo','preparacion'))",
  "location    TEXT NOT NULL DEFAULT 'Otro'",
  'pack_size_m INTEGER NOT NULL DEFAULT 0 CHECK (pack_size_m >= 0)', // 0 = se cuenta suelto
  "pack_label  TEXT NOT NULL DEFAULT ''",
  'sort_order  INTEGER NOT NULL DEFAULT 0', // orden en la hoja de conteo
];

// Apertura y cierre del día (o un conteo suelto). La migración 2 la agrega a bases anteriores.
const COUNT_KIND_COLUMN = "kind TEXT NOT NULL DEFAULT 'libre' CHECK (kind IN ('apertura','cierre','libre'))";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','caja','cocina')),
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
  updated_at  TEXT NOT NULL,
  ${ITEM_COLUMNS.join(',\n  ')}
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
  type        TEXT NOT NULL CHECK (type IN ('inicial','entrada','ajuste','venta','anulacion','produccion','baja','conteo')),
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

-- ---------- Cocina ----------

-- Receta de una preparación: con qué se hace y cuánto rinde el lote estándar.
CREATE TABLE IF NOT EXISTS preparations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  output_item_id INTEGER NOT NULL REFERENCES items(id),
  mode           TEXT NOT NULL CHECK (mode IN ('transformacion','lote')),
  std_output_m   INTEGER NOT NULL CHECK (std_output_m > 0),
  instructions   TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
-- position 0 = ingrediente base (con el que se escala el lote).
CREATE TABLE IF NOT EXISTS preparation_inputs (
  preparation_id INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  qty_m          INTEGER NOT NULL CHECK (qty_m > 0),
  unit           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  PRIMARY KEY (preparation_id, item_id)
);

-- Cada vez que la cocina prepara algo (reemplaza la hoja de merma y la de masa).
CREATE TABLE IF NOT EXISTS productions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  preparation_id   INTEGER NOT NULL REFERENCES preparations(id),
  preparation_name TEXT NOT NULL,
  output_item_id   INTEGER NOT NULL REFERENCES items(id),
  output_m         INTEGER NOT NULL CHECK (output_m > 0),
  expected_m       INTEGER NOT NULL,            -- lo que debía rendir según la receta estándar
  merma_util_m     INTEGER NOT NULL DEFAULT 0,  -- se aprovecha (caldos, etc.)
  merma_inutil_m   INTEGER NOT NULL DEFAULT 0,  -- se bota
  note             TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','anulada')),
  user_id          INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  local_date       TEXT NOT NULL,
  annulled_by      INTEGER REFERENCES users(id),
  annulled_at      TEXT,
  annul_reason     TEXT,
  is_demo          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prod_date ON productions(local_date);
CREATE TABLE IF NOT EXISTS production_inputs (
  production_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  item_name     TEXT NOT NULL,
  qty_m         INTEGER NOT NULL CHECK (qty_m > 0),
  PRIMARY KEY (production_id, item_id)
);

-- Bajas (reemplaza el formato de bajas en papel). Solo descuentan al aprobarlas.
CREATE TABLE IF NOT EXISTS wastes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  qty_m        INTEGER NOT NULL CHECK (qty_m > 0),
  unit         TEXT NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('vencido','danado','mal_preparado','accidente','devolucion','otro')),
  note         TEXT NOT NULL DEFAULT '',
  photo        TEXT,                    -- imagen JPEG comprimida (data URL)
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobada','rechazada')),
  reported_by  INTEGER NOT NULL REFERENCES users(id),
  reported_at  TEXT NOT NULL,
  local_date   TEXT NOT NULL,
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  review_note  TEXT NOT NULL DEFAULT '',
  is_demo      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wastes_status ON wastes(status, reported_at);

-- Faltantes que reporta la cocina o la caja.
CREATE TABLE IF NOT EXISTS shortages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  level       TEXT NOT NULL CHECK (level IN ('poco','agotado')),
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','pedido','recibido','descartado')),
  reported_by INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  closed_by   INTEGER REFERENCES users(id),
  is_demo     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shortages_status ON shortages(status, item_id);

-- Conteo físico de una ubicación (reemplaza la hoja de neveras).
CREATE TABLE IF NOT EXISTS counts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location    TEXT NOT NULL,
  ${COUNT_KIND_COLUMN},
  status      TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aplicado','descartado')),
  note        TEXT NOT NULL DEFAULT '',
  counted_by  INTEGER NOT NULL REFERENCES users(id),
  counted_at  TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  is_demo     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS count_lines (
  count_id   INTEGER NOT NULL REFERENCES counts(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  item_name  TEXT NOT NULL,
  expected_m INTEGER NOT NULL,   -- lo que decía el sistema al contar
  counted_m  INTEGER NOT NULL,
  PRIMARY KEY (count_id, item_id)
);

-- Plan de preparación: qué toca preparar cada día.
CREATE TABLE IF NOT EXISTS prep_tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  local_date     TEXT NOT NULL,
  preparation_id INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  target_m       INTEGER,        -- cantidad objetivo de la salida (opcional)
  note           TEXT NOT NULL DEFAULT '',
  production_id  INTEGER REFERENCES productions(id) ON DELETE SET NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL,
  is_demo        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON prep_tasks(local_date);
`;

/**
 * Migraciones para bases creadas con versiones anteriores. PRAGMA user_version
 * guarda cuántas se aplicaron. Una base nueva se crea ya con el esquema final.
 */
const MIGRATIONS: ((db: DB) => void)[] = [
  // 1. Roles caja/cocina, columnas de cocina en items y nuevos tipos de movimiento.
  (db) => {
    const sqlOf = (t: string) => (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t) as { sql: string }).sql;
    // SQLite no permite cambiar un CHECK: se reconstruyen users y movements con el procedimiento oficial.
    db.exec(`ALTER TABLE users RENAME TO users_old;`);
    db.exec(sqlOf('users_old').replace('users_old', 'users').replace("role IN ('admin','empleado')", "role IN ('admin','caja','cocina')"));
    db.exec(`INSERT INTO users SELECT id, username, name, CASE role WHEN 'empleado' THEN 'caja' ELSE role END, perms, pass_hash, active, is_demo, created_at, updated_at FROM users_old;
             DROP TABLE users_old;`);
    db.exec(`ALTER TABLE movements RENAME TO movements_old;`);
    db.exec(
      sqlOf('movements_old')
        .replace('movements_old', 'movements')
        .replace("'venta','anulacion')", "'venta','anulacion','produccion','baja','conteo')"),
    );
    db.exec(`INSERT INTO movements SELECT * FROM movements_old;
             DROP TABLE movements_old;
             CREATE INDEX IF NOT EXISTS idx_mov_item ON movements(item_id, created_at);`);
    for (const col of ITEM_COLUMNS) db.exec(`ALTER TABLE items ADD COLUMN ${col}`);
  },
  // 2. Conteos de apertura y cierre del día. La tabla counts puede no existir aún (base de la versión 0).
  (db) => {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='counts'").get()) {
      db.exec(`ALTER TABLE counts ADD COLUMN ${COUNT_KIND_COLUMN}`);
    }
  },
];

function migrate(db: DB) {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version >= MIGRATIONS.length) return;
  // Con las llaves foráneas apagadas se pueden reconstruir tablas sin romper referencias.
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let v = version; v < MIGRATIONS.length; v++) MIGRATIONS[v](db);
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length) throw new Error(`La migración dejó ${broken.length} referencias rotas.`);
      db.exec(`PRAGMA user_version = ${MIGRATIONS.length}; COMMIT;`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
  }
}

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const existing = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (existing) migrate(db);
  db.exec(SCHEMA);
  if (!existing) db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
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
