// Base de datos PostgreSQL.
// - En Render (producción): Neon, con la variable DATABASE_URL.
// - En el computador y en las pruebas: PGlite, un PostgreSQL que corre dentro de Node
//   (sin instalar nada). Guarda en data/pglite, o en memoria con ':memory:'.
// Todas las consultas usan parámetros (?) para evitar inyección SQL; aquí se convierten
// a $1, $2… como los pide PostgreSQL.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import pg from 'pg';

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface Stmt {
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface DB {
  prepare(sql: string): Stmt;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Un motor que sabe ejecutar una consulta (la conexión de Neon o PGlite). */
interface Runner {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; affectedRows: number }>;
  exec(sql: string): Promise<void>;
}

// Tablas con id automático: al insertar se pide el id de vuelta (como lastInsertRowid de SQLite).
const SERIAL_TABLES = new Set(['users', 'items', 'products', 'movements', 'preparations', 'productions', 'wastes', 'shortages', 'counts', 'prep_tasks', 'portionings']);

/** «WHERE a = ? AND b = ?» → «WHERE a = $1 AND b = $2». Las consultas del sistema no llevan «?» dentro de textos. */
function toPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function withReturning(sql: string): { sql: string; returning: boolean } {
  const m = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql);
  if (m && SERIAL_TABLES.has(m[1].toLowerCase()) && !/RETURNING/i.test(sql)) return { sql: `${sql} RETURNING id`, returning: true };
  return { sql, returning: false };
}

// ---------- Transacciones ----------
//
// Como en SQLite, se ejecuta UNA transacción a la vez: dos ventas al mismo tiempo no pueden
// leer la misma existencia y descontar dos veces. Dentro de una transacción, las funciones
// que abren otra usan un SAVEPOINT (se puede revertir solo esa parte).

interface TxState {
  runner: Runner;
  depth: number;
}

class Engine implements DB {
  private store = new AsyncLocalStorage<TxState>();
  private queue: Promise<void> = Promise.resolve();
  private base: Runner;
  private connect: () => Promise<Runner & { release(): void }>;
  private closeFn: () => Promise<void>;

  constructor(base: Runner, connect: () => Promise<Runner & { release(): void }>, close: () => Promise<void>) {
    this.base = base;
    this.connect = connect;
    this.closeFn = close;
  }

  private runner(): Runner {
    return this.store.getStore()?.runner ?? this.base;
  }

  prepare(sql: string): Stmt {
    const run = async (params: unknown[]) => {
      const q = withReturning(sql);
      const res = await this.runner().query(toPg(q.sql), params.map(normalizeParam));
      return { ...res, returning: q.returning };
    };
    return {
      get: async (...params) => (await run(params)).rows[0],
      all: async (...params) => (await run(params)).rows,
      run: async (...params) => {
        const r = await run(params);
        return { lastInsertRowid: r.returning ? Number(r.rows[0]?.id ?? 0) : 0, changes: r.affectedRows };
      },
    };
  }

  exec(sql: string): Promise<void> {
    return this.runner().exec(sql);
  }

  async tx<T>(fn: () => T | Promise<T>): Promise<T> {
    const cur = this.store.getStore();
    if (cur) {
      const sp = `sp${cur.depth}`;
      await cur.runner.exec(`SAVEPOINT ${sp}`);
      try {
        const r = await this.store.run({ runner: cur.runner, depth: cur.depth + 1 }, async () => fn());
        await cur.runner.exec(`RELEASE SAVEPOINT ${sp}`);
        return r;
      } catch (err) {
        await cur.runner.exec(`ROLLBACK TO SAVEPOINT ${sp}; RELEASE SAVEPOINT ${sp}`);
        throw err;
      }
    }
    // Espera su turno: una transacción a la vez.
    const prev = this.queue;
    let done!: () => void;
    this.queue = new Promise((r) => (done = r));
    await prev;
    const client = await this.connect();
    try {
      await client.exec('BEGIN');
      try {
        const r = await this.store.run({ runner: client, depth: 1 }, async () => fn());
        await client.exec('COMMIT');
        return r;
      } catch (err) {
        await client.exec('ROLLBACK');
        throw err;
      }
    } finally {
      client.release();
      done();
    }
  }

  close() {
    return this.closeFn();
  }
}

function normalizeParam(v: unknown) {
  // SQLite aceptaba true/false como 1/0; las columnas «activo», «demo»… son enteros.
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v === undefined ? null : v;
}

// Los enteros grandes (BIGINT) y las sumas llegan como texto: se convierten a número.
// Las cantidades se guardan en milésimas, así que caben de sobra en un número de JavaScript.
const toNumber = (v: string) => Number(v);
pg.types.setTypeParser(20, toNumber); // int8
pg.types.setTypeParser(1700, toNumber); // numeric (SUM)

function pgEngine(url: string): Engine {
  const pool = new pg.Pool({ connectionString: url, max: 5, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  const wrap = (c: pg.Pool | pg.PoolClient): Runner => ({
    query: async (sql, params) => {
      const r = await c.query(sql, params);
      return { rows: r.rows, affectedRows: r.rowCount ?? 0 };
    },
    exec: async (sql) => {
      await c.query(sql);
    },
  });
  return new Engine(
    wrap(pool),
    async () => {
      const c = await pool.connect();
      return { ...wrap(c), release: () => c.release() };
    },
    () => pool.end(),
  );
}

async function pgliteEngine(path: string): Promise<Engine> {
  if (path !== ':memory:') mkdirSync(path, { recursive: true });
  // Se carga solo aquí: PGlite ocupa mucha memoria y en Render (con Neon) no se usa.
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(path === ':memory:' ? undefined : path, { parsers: { 20: toNumber, 1700: toNumber } });
  await lite.waitReady;
  // PGlite tiene una sola conexión: mientras corre una transacción, las demás consultas
  // esperan su turno (si no, quedarían metidas dentro de esa transacción).
  const raw: Runner = {
    query: async (sql, params) => {
      const r = await lite.query<Record<string, unknown>>(sql, params);
      // Las sumas (numeric, 1700) llegan como texto: se pasan a número, igual que con Neon.
      const numeric = r.fields.filter((f) => f.dataTypeID === 1700 || f.dataTypeID === 20).map((f) => f.name);
      if (numeric.length) for (const row of r.rows) for (const k of numeric) if (typeof row[k] === 'string') row[k] = Number(row[k]);
      return { rows: r.rows, affectedRows: r.affectedRows ?? 0 };
    },
    exec: async (sql) => {
      await lite.exec(sql);
    },
  };
  let lock: Promise<void> = Promise.resolve();
  const acquire = async () => {
    const prev = lock;
    let free!: () => void;
    lock = new Promise((r) => (free = r));
    await prev;
    return free;
  };
  const locked: Runner = {
    query: async (sql, params) => {
      const free = await acquire();
      try {
        return await raw.query(sql, params);
      } finally {
        free();
      }
    },
    exec: async (sql) => {
      const free = await acquire();
      try {
        await raw.exec(sql);
      } finally {
        free();
      }
    },
  };
  return new Engine(
    locked,
    async () => ({ ...raw, release: await acquire() }),
    () => lite.close(),
  );
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','caja','cocina')),
  perms       TEXT NOT NULL DEFAULT '[]',
  pass_hash   TEXT,               -- NULL = no puede iniciar sesión (usuarios DEMO)
  active      INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  base_unit   TEXT NOT NULL CHECK (base_unit IN ('g','ml','unidad')),
  unit        TEXT NOT NULL,      -- unidad en la que se muestra (g, kg, ml, l, unidad)
  qty_m       BIGINT NOT NULL DEFAULT 0 CHECK (qty_m >= 0),
  min_m       BIGINT NOT NULL DEFAULT 0 CHECK (min_m >= 0),
  active      INTEGER NOT NULL DEFAULT 1,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'insumo' CHECK (kind IN ('insumo','preparacion')),
  location    TEXT NOT NULL DEFAULT 'Otro',
  pack_size_m BIGINT NOT NULL DEFAULT 0 CHECK (pack_size_m >= 0), -- 0 = se cuenta suelto
  pack_label  TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- orden en la hoja de conteo
  portions    TEXT NOT NULL DEFAULT '[]'   -- porciones: JSON [{label, size_m}]
);

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
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
  qty_m       BIGINT NOT NULL CHECK (qty_m > 0),
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
  per_unit_m  BIGINT NOT NULL,
  total_m     BIGINT NOT NULL,
  PRIMARY KEY (sale_id, product_id, item_id)
);

CREATE TABLE IF NOT EXISTS movements (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  created_at  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('inicial','entrada','ajuste','venta','anulacion','produccion','baja','conteo','porcionado')),
  delta_m     BIGINT NOT NULL,
  after_m     BIGINT NOT NULL,
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
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  output_item_id INTEGER NOT NULL REFERENCES items(id),
  mode           TEXT NOT NULL CHECK (mode IN ('transformacion','lote')),
  std_output_m   BIGINT NOT NULL CHECK (std_output_m > 0),
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
  qty_m          BIGINT NOT NULL CHECK (qty_m > 0),
  unit           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  PRIMARY KEY (preparation_id, item_id)
);

-- Cada vez que la cocina prepara algo (reemplaza la hoja de merma y la de masa).
CREATE TABLE IF NOT EXISTS productions (
  id               SERIAL PRIMARY KEY,
  preparation_id   INTEGER NOT NULL REFERENCES preparations(id),
  preparation_name TEXT NOT NULL,
  output_item_id   INTEGER NOT NULL REFERENCES items(id),
  output_m         BIGINT NOT NULL CHECK (output_m > 0),
  expected_m       BIGINT NOT NULL,            -- lo que debía rendir según la receta estándar
  merma_util_m     BIGINT NOT NULL DEFAULT 0,  -- se aprovecha (caldos, etc.)
  merma_inutil_m   BIGINT NOT NULL DEFAULT 0,  -- se bota
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
  qty_m         BIGINT NOT NULL CHECK (qty_m > 0),
  position      INTEGER NOT NULL DEFAULT 0,  -- 0 = ingrediente base
  PRIMARY KEY (production_id, item_id)
);

-- Bajas (reemplaza el formato de bajas en papel). Solo descuentan al aprobarlas.
CREATE TABLE IF NOT EXISTS wastes (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  qty_m        BIGINT NOT NULL CHECK (qty_m > 0),
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
  id          SERIAL PRIMARY KEY,
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
  id          SERIAL PRIMARY KEY,
  location    TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'libre' CHECK (kind IN ('apertura','cierre','libre')),
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
  expected_m BIGINT NOT NULL,   -- lo que decía el sistema al contar
  counted_m  BIGINT NOT NULL,
  detail     TEXT,              -- cómo se contó: paquetes + porciones + suelto (JSON)
  PRIMARY KEY (count_id, item_id)
);

-- Plan de preparación: qué toca preparar cada día.
CREATE TABLE IF NOT EXISTS prep_tasks (
  id             SERIAL PRIMARY KEY,
  local_date     TEXT NOT NULL,
  preparation_id INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  target_m       BIGINT,         -- cantidad objetivo de la salida (opcional)
  note           TEXT NOT NULL DEFAULT '',
  production_id  INTEGER REFERENCES productions(id) ON DELETE SET NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL,
  is_demo        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON prep_tasks(local_date);

-- Porcionado: la cocina parte un insumo en porciones (pechuga en porciones de 80 g…).
-- Las porciones siguen siendo el MISMO artículo; solo se descuenta la merma que se bota.
CREATE TABLE IF NOT EXISTS portionings (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  item_name    TEXT NOT NULL,
  lines        TEXT NOT NULL,              -- JSON [{label, size_m, n}]
  output_m     BIGINT NOT NULL CHECK (output_m > 0),
  merma_m      BIGINT NOT NULL DEFAULT 0 CHECK (merma_m >= 0),
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','anulada')),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  local_date   TEXT NOT NULL,
  annulled_by  INTEGER REFERENCES users(id),
  annulled_at  TEXT,
  annul_reason TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portionings_date ON portionings(local_date);
`;

/**
 * Abre la base: con una dirección postgres:// usa Neon (o cualquier PostgreSQL);
 * con una carpeta o ':memory:' usa PGlite. Crea las tablas si no existen.
 */
export async function openDb(target: string): Promise<DB> {
  const engine = /^postgres(ql)?:\/\//.test(target) ? pgEngine(target) : await pgliteEngine(target);
  await engine.exec(SCHEMA);
  return engine;
}

/**
 * Ejecuta fn dentro de una transacción. Si algo falla se revierte TODO
 * (no queda una venta sin descuentos ni descuentos sin venta).
 */
export function tx<T>(db: DB, fn: () => T | Promise<T>): Promise<T> {
  return (db as Engine).tx(fn);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getSetting(db: DB, key: string): Promise<string | undefined> {
  const row = (await db.prepare('SELECT value FROM settings WHERE key = ?').get(key)) as { value: string } | undefined;
  return row?.value;
}

export async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export async function isDemoMode(db: DB): Promise<boolean> {
  return (await getSetting(db, 'demo_mode')) === '1';
}

/** Como Array.map, pero esperando cada elemento en orden (las consultas no se mezclan). */
export async function mapAsync<T, R>(list: readonly T[], fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i++) out.push(await fn(list[i], i));
  return out;
}
