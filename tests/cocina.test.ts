// Pruebas del módulo de cocina: preparaciones, bajas, faltantes, conteos, plan y roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, type DB } from '../server/db.ts';
import * as inv from '../server/services/inventory.ts';
import * as prod from '../server/services/products.ts';
import * as sales from '../server/services/sales.ts';
import * as preps from '../server/services/preparations.ts';
import * as wastes from '../server/services/wastes.ts';
import * as shortages from '../server/services/shortages.ts';
import * as counts from '../server/services/counts.ts';
import * as plan from '../server/services/plan.ts';
import * as kitchen from '../server/services/kitchen.ts';
import * as reports from '../server/services/reports.ts';
import * as users from '../server/services/users.ts';
import { addDays, localDate } from '../shared/dates.ts';

function setup() {
  const db = openDb(':memory:');
  const admin = users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  const cook = users.createUser(db, { username: 'carlos', name: 'Carlos', role: 'cocina', password: 'clave-cocina-1' });
  const cashier = users.createUser(db, { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  return { db, admin, cook, cashier };
}

const qty = (db: DB, id: number) => inv.getItem(db, id).qty_m;

/** Cebolla (insumo) con dos destinos: picada y caramelizada. */
function onionKit(db: DB, admin: users.User) {
  const cebolla = inv.createItem(db, admin, { name: 'Cebolla', category: 'Verduras y frutas', unit: 'kg', qty: 5, min: 1, location: 'Nevera Coca-Cola' });
  const caramelizada = inv.createItem(db, admin, { name: 'Cebolla caramelizada', category: 'Verduras y frutas', unit: 'g', qty: 0, min: 300, location: 'Nevera negra' });
  const picada = inv.createItem(db, admin, { name: 'Cebolla picada', category: 'Verduras y frutas', unit: 'g', qty: 0, min: 300, location: 'Nevera negra' });
  const carame = preps.createPreparation(db, {
    name: 'Cebolla caramelizada',
    mode: 'transformacion',
    output_item_id: caramelizada.id,
    std_output: 450,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1000, unit: 'g' }],
  });
  const pica = preps.createPreparation(db, {
    name: 'Cebolla picada',
    mode: 'transformacion',
    output_item_id: picada.id,
    std_output: 850,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1, unit: 'kg' }],
  });
  return { cebolla, caramelizada, picada, carame, pica };
}

test('13. una preparación descuenta el insumo, suma el resultado y calcula merma y rendimiento', () => {
  const { db, admin, cook } = setup();
  const k = onionKit(db, admin);
  assert.equal(k.carame.std_yield_pct, 45);
  assert.equal(inv.getItem(db, k.caramelizada.id).kind, 'preparacion');

  // Hoja de merma: 1000 g de cebolla, 50 g de merma útil, salen 400 g → merma inútil 550 g.
  const p = preps.registerProduction(db, cook, {
    preparation_id: k.carame.id,
    input_qty: 1000,
    input_unit: 'g',
    output_qty: 400,
    output_unit: 'g',
    merma_util_qty: 50,
  });
  assert.equal(qty(db, k.cebolla.id), 4_000_000);
  assert.equal(qty(db, k.caramelizada.id), 400_000);
  assert.equal(p.merma_util_m, 50_000);
  assert.equal(p.merma_inutil_m, 550_000);
  assert.equal(p.yield_pct, 40);
  assert.equal(p.expected_m, 450_000);
  assert.equal(p.efficiency_pct, 88.9);
  assert.equal(p.low, true); // por debajo del 90 % del estándar

  // La misma cebolla sirve para la otra preparación.
  preps.registerProduction(db, cook, { preparation_id: k.pica.id, input_qty: 2, input_unit: 'kg', output_qty: 1.7, output_unit: 'kg' });
  assert.equal(qty(db, k.cebolla.id), 2_000_000);
  assert.equal(qty(db, k.picada.id), 1_700_000);

  // Si no alcanza la cebolla, no se registra nada.
  assert.throws(() => preps.registerProduction(db, cook, { preparation_id: k.pica.id, input_qty: 3, input_unit: 'kg', output_qty: 2, output_unit: 'kg' }), /No alcanza/);
  assert.equal(qty(db, k.cebolla.id), 2_000_000);

  // Anular devuelve todo.
  preps.annulProduction(db, admin, p.id, { reason: 'Se registró dos veces' });
  assert.equal(qty(db, k.cebolla.id), 3_000_000);
  assert.equal(qty(db, k.caramelizada.id), 0);
  // Cada existencia sigue siendo la suma de sus movimientos.
  for (const it of inv.listItems(db)) {
    const m = (db.prepare('SELECT COALESCE(SUM(delta_m),0) n FROM movements WHERE item_id = ?').get(it.id) as { n: number }).n;
    assert.equal(m, it.qty_m, it.name);
  }
});

test('14. receta por lote: la masa escala según la harina y compara contra el rendimiento estándar', () => {
  const { db, admin, cook } = setup();
  const harina = inv.createItem(db, admin, { name: 'Harina', category: 'Abarrotes', unit: 'kg', qty: 20, min: 5 });
  const levadura = inv.createItem(db, admin, { name: 'Levadura', category: 'Abarrotes', unit: 'g', qty: 500, min: 50 });
  const sal = inv.createItem(db, admin, { name: 'Sal', category: 'Abarrotes', unit: 'g', qty: 1000, min: 50 });
  const masa = inv.createItem(db, admin, { name: 'Masa', category: 'Masas y panes', unit: 'kg', qty: 0, min: 2 });
  const receta = preps.createPreparation(db, {
    name: 'Masa de pizza',
    mode: 'lote',
    output_item_id: masa.id,
    std_output: 7.715,
    std_output_unit: 'kg',
    inputs: [
      { item_id: harina.id, qty: 5000, unit: 'g' },
      { item_id: levadura.id, qty: 30, unit: 'g' },
      { item_id: sal.id, qty: 25, unit: 'g' },
    ],
  });
  // En un lote no hay "% de merma": lo que importa es lo que rindió frente al estándar escalado.
  assert.equal(receta.std_yield_pct, null);
  const p = preps.registerProduction(db, cook, {
    preparation_id: receta.id,
    inputs: [
      { item_id: harina.id, qty: 10, unit: 'kg' },
      { item_id: levadura.id, qty: 60, unit: 'g' },
      { item_id: sal.id, qty: 50, unit: 'g' },
    ],
    output_qty: 15.43,
    output_unit: 'kg',
  });
  assert.equal(p.expected_m, 15_430_000); // 10 kg de harina = 2 lotes de 7,715 kg
  assert.equal(p.efficiency_pct, 100);
  assert.equal(qty(db, harina.id), 10_000_000);
  assert.equal(qty(db, levadura.id), 440_000);
  assert.equal(qty(db, masa.id), 15_430_000);
  // Un ingrediente que no está en la receta no se acepta.
  assert.throws(
    () => preps.registerProduction(db, cook, { preparation_id: receta.id, inputs: [{ item_id: masa.id, qty: 1, unit: 'kg' }], output_qty: 1, output_unit: 'kg' }),
    /no hace parte/,
  );
});

test('15. bajas: pendiente no descuenta, aprobada descuenta, rechazada no', () => {
  const { db, admin, cook } = setup();
  const tomate = inv.createItem(db, admin, { name: 'Tomate', category: 'Verduras y frutas', unit: 'kg', qty: 2, min: 0.5 });
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  const w1 = wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 100, unit: 'g', reason: 'danado', note: 'Poca rotación y moho', photo });
  assert.equal(w1.status, 'pendiente');
  assert.equal(w1.has_photo, true);
  assert.equal(qty(db, tomate.id), 2_000_000);
  // La cocina no ve las bajas de otros, el administrador sí.
  assert.equal(wastes.listWastes(db, cook, {}).length, 1);
  assert.equal(wastes.getWastePhoto(db, admin, w1.id).photo, photo);

  wastes.reviewWaste(db, admin, w1.id, { decision: 'aprobar' });
  assert.equal(qty(db, tomate.id), 1_900_000);
  assert.throws(() => wastes.reviewWaste(db, admin, w1.id, { decision: 'aprobar' }), /ya fue revisada/);

  const w2 = wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 0.3, unit: 'kg', reason: 'vencido' });
  assert.throws(() => wastes.reviewWaste(db, admin, w2.id, { decision: 'rechazar' }), /Explica/);
  wastes.reviewWaste(db, admin, w2.id, { decision: 'rechazar', note: 'Ese tomate sí sirve' });
  assert.equal(qty(db, tomate.id), 1_900_000);

  // La baja del administrador queda aprobada de una vez.
  const w3 = wastes.reportWaste(db, admin, { item_id: tomate.id, qty: 200, unit: 'g', reason: 'accidente' });
  assert.equal(w3.status, 'aprobada');
  assert.equal(qty(db, tomate.id), 1_700_000);
  assert.throws(() => wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 1, unit: 'kg', reason: 'otro' }), /Explica/);
  assert.throws(() => wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 1, unit: 'kg', reason: 'vencido', photo: 'data:text/html;base64,AAAA' }), /foto/);
});

test('16. faltantes: no se duplican, entran a la lista de compras y se cierran al registrar la entrada', () => {
  const { db, admin, cook, cashier } = setup();
  const lechuga = inv.createItem(db, admin, { name: 'Lechuga', category: 'Verduras y frutas', unit: 'g', qty: 400, min: 300 });
  const queso = inv.createItem(db, admin, { name: 'Queso', category: 'Lácteos', unit: 'kg', qty: 1, min: 2 }); // bajo el mínimo
  const a = shortages.reportShortage(db, cook, { item_id: lechuga.id, level: 'poco' });
  const b = shortages.reportShortage(db, cashier, { item_id: lechuga.id, level: 'agotado', note: 'Se acabó en la noche' });
  assert.equal(b.merged, true);
  assert.equal(b.id, a.id);
  assert.equal(b.level, 'agotado');
  assert.equal(shortages.listShortages(db, {}).length, 1);

  const list = shortages.shoppingList(db);
  assert.deepEqual(
    list.map((l) => l.name),
    ['Lechuga', 'Queso'],
  );
  assert.equal(list[1].suggested_m, 3_000_000); // para quedar en el doble del mínimo (4 kg)

  shortages.setShortageStatus(db, admin, a.id, { status: 'pedido' });
  assert.throws(() => shortages.setShortageStatus(db, admin, a.id, { status: 'recibido' }), /entrada/);
  inv.registerEntry(db, admin, lechuga.id, { qty: 1, unit: 'kg', reason: 'Llegó el pedido' });
  assert.equal(shortages.getShortage(db, a.id).status, 'recibido');
  assert.deepEqual(
    shortages.shoppingList(db).map((l) => l.name),
    ['Queso'],
  );
  void queso;
});

test('17. conteo por nevera: la cocina envía, el administrador aplica solo la diferencia', () => {
  const { db, admin, cook, cashier } = setup();
  const peperoni = inv.createItem(db, admin, {
    name: 'Pepperoni',
    category: 'Carnes y embutidos',
    unit: 'kg',
    qty: 3,
    min: 1,
    location: 'Congelador',
    pack_size: 500,
    pack_unit: 'g',
    pack_label: 'paquete',
  });
  const jamon = inv.createItem(db, admin, { name: 'Jamón', category: 'Carnes y embutidos', unit: 'kg', qty: 2, min: 1, location: 'Congelador' });
  assert.equal(peperoni.pack_size_m, 500_000);
  assert.deepEqual(
    counts.countSheet(db, 'Congelador').lines.map((l) => l.name),
    ['Jamón', 'Pepperoni'],
  );

  // 5 paquetes + 270 g de pepperoni = 2,77 kg (faltan 230 g); el jamón está completo.
  const c = counts.submitCount(db, cook, {
    location: 'Congelador',
    lines: [
      { item_id: peperoni.id, qty: 2770, unit: 'g' },
      { item_id: jamon.id, qty: 2, unit: 'kg' },
    ],
  });
  assert.equal(c.status, 'pendiente');
  assert.equal(c.diff_count, 1);
  assert.equal(qty(db, peperoni.id), 3_000_000); // aún no cambia

  // Mientras el administrador revisa, se gastan 200 g en una venta: no se debe contar dos veces.
  const pizza = prod.createProduct(db, { name: 'Pizza', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: peperoni.id, qty: 200, unit: 'g' }] });
  sales.registerSale(db, cashier, { requestId: 'conteo-1', items: [{ productId: pizza.id, qty: 1 }] });
  counts.reviewCount(db, admin, c.id, { decision: 'aplicar' });
  assert.equal(qty(db, peperoni.id), 2_570_000); // 3 kg − 230 g de diferencia − 200 g vendidos
  assert.equal(qty(db, jamon.id), 2_000_000);
  assert.equal(counts.getCount(db, admin, c.id).status, 'aplicado');
  assert.throws(() => counts.submitCount(db, cook, { location: 'Nevera negra', lines: [{ item_id: jamon.id, qty: 1 }] }), /no está en Nevera negra/);
});

test('18. plan de preparación: la tarea del día se marca hecha al preparar y se copia a la semana siguiente', () => {
  const { db, admin, cook } = setup();
  const k = onionKit(db, admin);
  const today = localDate();
  const t = plan.addTask(db, admin, { date: today, preparation_id: k.carame.id, target_qty: 900, target_unit: 'g' });
  assert.equal(t.production_id, null);
  assert.equal(t.target_m, 900_000);
  const p = preps.registerProduction(db, cook, { preparation_id: k.carame.id, input_qty: 2, input_unit: 'kg', output_qty: 900, output_unit: 'g' });
  const done = plan.getTask(db, t.id);
  assert.equal(done.production_id, p.id);
  assert.equal(done.done_by_name, 'Carlos');
  assert.throws(() => plan.deleteTask(db, t.id), /ya se hizo/);
  assert.equal(kitchen.kitchenToday(db, cook).tasks.length, 1);

  const next = plan.copyPreviousWeek(db, admin, addDays(plan.weekPlan(db, today).to, 1));
  assert.equal(next.added, 1);
  assert.equal(next.tasks[0].production_id, null);
});

test('19. tablero y reporte de cocina', () => {
  const { db, admin, cook } = setup();
  const k = onionKit(db, admin);
  preps.registerProduction(db, cook, { preparation_id: k.carame.id, input_qty: 1, input_unit: 'kg', output_qty: 300, output_unit: 'g' });
  wastes.reportWaste(db, cook, { item_id: k.cebolla.id, qty: 100, unit: 'g', reason: 'danado' });
  shortages.reportShortage(db, cook, { item_id: k.cebolla.id, level: 'poco' });
  inv.registerEntry(db, admin, k.cebolla.id, { qty: 2, unit: 'kg', reason: 'Compra' });
  const s = reports.kitchenSummary(db);
  assert.equal(s.pendingWastes, 1);
  assert.equal(s.openShortages, 0); // la entrada cerró el faltante
  assert.equal(s.productionsWeek, 1);
  assert.equal(s.lowYield.length, 1);
  const r = reports.kitchenReport(db, 'dia', localDate());
  assert.equal(r.productions[0].count, 1);
  assert.equal(r.entries[0].total_m, 2_000_000);
});

test('20. catálogo Pizza Diana: carga productos, preparaciones y menú sin duplicar', () => {
  const { db, admin } = setup();
  const first = kitchen.loadCatalog(db, admin);
  assert.ok(first.items > 40);
  assert.equal(first.preparations, 8);
  assert.ok(first.products >= 10);
  assert.ok(inv.listItems(db).every((i) => i.qty_m === 0));
  const cebolla = inv.listItems(db).find((i) => i.name === 'Cebolla')!;
  // La cebolla sirve para dos preparaciones.
  assert.equal(preps.listPreparations(db).filter((p) => p.inputs[0].item_id === cebolla.id).length, 2);
  const again = kitchen.loadCatalog(db, admin);
  assert.deepEqual(again, { items: 0, preparations: 0, products: 0 });
});

test('21. migración: una base de la versión anterior conserva sus datos y «empleado» pasa a «caja»', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-mig-'));
  const path = join(dir, 'vieja.db');
  try {
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','empleado')), perms TEXT NOT NULL DEFAULT '[]', pass_hash TEXT,
        active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
      CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
        base_unit TEXT NOT NULL CHECK (base_unit IN ('g','ml','unidad')), unit TEXT NOT NULL,
        qty_m INTEGER NOT NULL DEFAULT 0 CHECK (qty_m >= 0), min_m INTEGER NOT NULL DEFAULT 0 CHECK (min_m >= 0),
        active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE sales (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL, local_date TEXT NOT NULL, total_units INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada','anulada')), annulled_by INTEGER REFERENCES users(id),
        annulled_at TEXT, annul_reason TEXT, is_demo INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE movements (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id), created_at TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('inicial','entrada','ajuste','venta','anulacion')), delta_m INTEGER NOT NULL, after_m INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL REFERENCES users(id), sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
        is_demo INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX idx_mov_item ON movements(item_id, created_at);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO users VALUES (1,'jose','Jose','admin','[]','scrypt$x$y',1,0,'2026-10-01','2026-10-01');
      INSERT INTO users VALUES (2,'rafa','Rafa','empleado','["entradas"]','scrypt$x$y',1,0,'2026-10-01','2026-10-01');
      INSERT INTO sessions VALUES ('tok', 2, '2999-01-01');
      INSERT INTO items VALUES (1,'Queso','Ingredientes','g','kg',5000000,1000000,1,0,'2026-10-01','2026-10-01');
      INSERT INTO movements VALUES (1,1,'2026-10-01','inicial',5000000,5000000,'Existencia inicial',1,NULL,0);
    `);
    old.close();

    const db = openDb(path);
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
    const rafa = users.getUser(db, 2);
    assert.equal(rafa.role, 'caja');
    assert.deepEqual(rafa.perms, ['entradas']);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM sessions').get() as { n: number }).n, 1);
    const queso = inv.getItem(db, 1);
    assert.equal(queso.qty_m, 5_000_000);
    assert.equal(queso.kind, 'insumo');
    assert.equal(queso.location, 'Otro');
    // Los tipos de movimiento nuevos ya se pueden guardar.
    const admin = users.getUser(db, 1);
    wastes.reportWaste(db, admin, { item_id: 1, qty: 100, unit: 'g', reason: 'vencido' });
    assert.equal(inv.getItem(db, 1).qty_m, 4_900_000);
    assert.equal(inv.listMovements(db, { type: 'baja' }).length, 1);
    db.close();
    // Abrirla otra vez no vuelve a migrar.
    openDb(path).close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
