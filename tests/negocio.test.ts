// Pruebas de las reglas de negocio contra una base de datos real (SQLite en memoria o en disco).
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../server/db.ts';
import * as inv from '../server/services/inventory.ts';
import * as prod from '../server/services/products.ts';
import * as sales from '../server/services/sales.ts';
import * as reports from '../server/services/reports.ts';
import * as users from '../server/services/users.ts';
import * as demo from '../server/services/demo.ts';
import { AppError } from '../server/errors.ts';
import { localDate } from '../shared/dates.ts';

let seq = 0;
const rid = () => `test-request-${++seq}-${Date.now()}`;

async function setup() {
  const db = await openDb(':memory:');
  const admin = await users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  return { db, admin };
}

/** Pizza de prueba: 200 g queso, 80 g salsa, 1 masa, 1 caja. */
async function pizzaKit(db: DB, admin: users.User) {
  const queso = await inv.createItem(db, admin, { name: 'Queso', category: 'Ingredientes', unit: 'kg', qty: 2, min: 0.5 });
  const salsa = await inv.createItem(db, admin, { name: 'Salsa', category: 'Ingredientes', unit: 'g', qty: 1000, min: 100 });
  const masa = await inv.createItem(db, admin, { name: 'Masa', category: 'Productos preparados', unit: 'unidad', qty: 10, min: 2 });
  const caja = await inv.createItem(db, admin, { name: 'Caja', category: 'Empaques', unit: 'unidad', qty: 10, min: 2 });
  const pizza = await prod.createProduct(db, {
    name: 'Pizza de prueba',
    category: 'Pizzas',
    type: 'preparado',
    recipe: [
      { item_id: queso.id, qty: 200, unit: 'g' },
      { item_id: salsa.id, qty: 80, unit: 'g' },
      { item_id: masa.id, qty: 1, unit: 'unidad' },
      { item_id: caja.id, qty: 1, unit: 'unidad' },
    ],
  });
  return { queso, salsa, masa, caja, pizza };
}

const qty = async (db: DB, id: number) => (await inv.getItem(db, id)).qty_m;

test('1. crear un ingrediente registra su existencia inicial con movimiento', async () => {
  const { db, admin } = await setup();
  const it = await inv.createItem(db, admin, { name: 'Queso mozzarella', category: 'Ingredientes', unit: 'kg', qty: 1.5, min: 0.3 });
  assert.equal(it.base_unit, 'g');
  assert.equal(it.qty_m, 1_500_000); // 1,5 kg = 1500 g guardados como milésimas
  assert.equal(it.status, 'disponible');
  const movs = await inv.listMovements(db, { itemId: it.id });
  assert.equal(movs.length, 1);
  assert.equal(movs[0].type, 'inicial');
  assert.equal(movs[0].delta_m, 1_500_000);
});

test('2. entrada de mercancía suma y queda trazada; conversión kg/g sin errores de precisión', async () => {
  const { db, admin } = await setup();
  const it = await inv.createItem(db, admin, { name: 'Queso', category: 'Ingredientes', unit: 'kg', qty: 0.1, min: 0 });
  await inv.registerEntry(db, admin, it.id, { qty: 0.2, unit: 'kg', reason: 'Compra' });
  await inv.registerEntry(db, admin, it.id, { qty: 300, unit: 'g', reason: 'Compra' });
  assert.equal(await qty(db, it.id), 600_000); // 0,1 + 0,2 kg + 300 g = 600 g exactos
  await assert.rejects(async () => await inv.registerEntry(db, admin, it.id, { qty: 1, unit: 'ml' }), /compatible/);
  await assert.rejects(async () => await inv.registerEntry(db, admin, it.id, { qty: -5, unit: 'g' }), /negativo/);
  const movs = await inv.listMovements(db, { itemId: it.id, type: 'entrada' });
  assert.equal(movs.length, 2);
  assert.equal(movs[0].user_name, 'Admin');
});

test('3. receta con varios ingredientes y validaciones', async () => {
  const { db, admin } = await setup();
  const { pizza, queso } = await pizzaKit(db, admin);
  assert.equal(pizza.recipe.length, 4);
  assert.deepEqual(pizza.warnings, []);
  await assert.rejects(
    async () => await prod.createProduct(db, { name: 'X', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: queso.id, qty: 0, unit: 'g' }] }),
    /mayor que cero/,
  );
  await assert.rejects(
    async () => await prod.createProduct(db, { name: 'X', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: queso.id, qty: -3, unit: 'g' }] }),
    /negativo/,
  );
  await assert.rejects(
    async () =>
      await prod.createProduct(db, {
        name: 'X',
        category: 'Pizzas',
        type: 'preparado',
        recipe: [
          { item_id: queso.id, qty: 10, unit: 'g' },
          { item_id: queso.id, qty: 20, unit: 'g' },
        ],
      }),
    /repetido/,
  );
  const sinReceta = await prod.createProduct(db, { name: 'Pizza sin receta', category: 'Pizzas', type: 'preparado', recipe: [] });
  assert.match(sinReceta.warnings[0], /receta/);
  await assert.rejects(async () => await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: sinReceta.id, qty: 1 }] }), /receta/);
});

test('4 y 5. la venta descuenta los ingredientes de forma proporcional y guarda la copia de la receta', async () => {
  const { db, admin } = await setup();
  const k = await pizzaKit(db, admin);
  const { sale } = await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 1 }] });
  assert.equal(await qty(db, k.queso.id), 1_800_000);
  assert.equal(await qty(db, k.masa.id), 9_000);

  await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 3 }] });
  assert.equal(await qty(db, k.queso.id), 1_800_000 - 3 * 200_000);
  assert.equal(await qty(db, k.salsa.id), 1_000_000 - 4 * 80_000);
  assert.equal(await qty(db, k.caja.id), 6_000);

  // Cambiar la receta después NO altera el consumo histórico guardado.
  await prod.updateProduct(db, k.pizza.id, { recipe: [{ item_id: k.queso.id, qty: 999, unit: 'g' }, { item_id: k.masa.id, qty: 1, unit: 'unidad' }] });
  const detail = await sales.getSale(db, admin, sale.id) as { consumption: { item_id: number; per_unit_m: number }[] };
  assert.equal(detail.consumption.find((c) => c.item_id === k.queso.id)?.per_unit_m, 200_000);
  assert.equal(detail.consumption.length, 4);

  const movs = await inv.listMovements(db, { itemId: k.queso.id, type: 'venta' });
  assert.equal(movs.length, 2);
});

test('6. una bebida descuenta una unidad por cada bebida vendida', async () => {
  const { db, admin } = await setup();
  const gas = await inv.createItem(db, admin, { name: 'Gaseosa', category: 'Bebidas', unit: 'unidad', qty: 24, min: 6 });
  const p = await prod.createProduct(db, { name: 'Gaseosa', category: 'Bebidas', type: 'directo', recipe: [{ item_id: gas.id, qty: 1, unit: 'unidad' }] });
  await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: p.id, qty: 5 }] });
  assert.equal(await qty(db, gas.id), 19_000);
});

test('7. sin existencias suficientes la venta se rechaza y el inventario no cambia', async () => {
  const { db, admin } = await setup();
  const k = await pizzaKit(db, admin);
  const before = (await inv.listItems(db)).map((i) => i.qty_m);
  const salesBefore = (await sales.listSales(db, admin, {})).length;
  await assert.rejects(
    async () => await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 11 }] }),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.status, 409);
      const names = (err.details as { shortages: { item_name: string }[] }).shortages.map((s) => s.item_name);
      assert.deepEqual(names.sort(), ['Caja', 'Masa', 'Queso']);
      return true;
    },
  );
  assert.deepEqual((await inv.listItems(db)).map((i) => i.qty_m), before);
  assert.equal((await sales.listSales(db, admin, {})).length, salesBefore);
  assert.equal((await inv.listMovements(db, { type: 'venta' })).length, 0);
});

test('7b. una petición repetida (doble clic) no descuenta dos veces', async () => {
  const { db, admin } = await setup();
  const k = await pizzaKit(db, admin);
  const requestId = rid();
  const a = await sales.registerSale(db, admin, { requestId, items: [{ productId: k.pizza.id, qty: 2 }] });
  const b = await sales.registerSale(db, admin, { requestId, items: [{ productId: k.pizza.id, qty: 2 }] });
  assert.equal(a.sale.id, b.sale.id);
  assert.equal(b.duplicate, true);
  assert.equal(await qty(db, k.masa.id), 8_000);
  assert.equal((await sales.listSales(db, admin, {})).length, 1);
});

test('8 y 9. anular devuelve el inventario y las anuladas no cuentan en los totales', async () => {
  const { db, admin } = await setup();
  const k = await pizzaKit(db, admin);
  const keep = await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 1 }] });
  const wrong = await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 2 }] });
  assert.equal(await qty(db, k.queso.id), 2_000_000 - 3 * 200_000);

  await sales.annulSale(db, admin, wrong.sale.id, { reason: 'Error de digitación' });
  assert.equal(await qty(db, k.queso.id), 2_000_000 - 200_000);
  assert.equal(await qty(db, k.masa.id), 9_000);
  await assert.rejects(async () => await sales.annulSale(db, admin, wrong.sale.id, { reason: 'otra vez' }), /ya fue anulada/);

  // El registro original se conserva para auditoría.
  const s = await sales.getSale(db, admin, wrong.sale.id);
  assert.equal(s.status, 'anulada');
  assert.equal((await inv.listMovements(db, { type: 'anulacion' })).length, 4);

  const today = localDate();
  const d = await reports.dashboard(db, today);
  assert.equal(d.units.today, 1);
  assert.equal((await reports.periodReport(db, 'dia', today)).total, 1);
  assert.equal((await reports.periodReport(db, 'dia', today)).annulled, 1);
  assert.equal((await reports.byProduct(db, { from: today, to: today }))[0].units, 1);
  assert.ok(keep.sale.id);
});

test('10. los reportes usan hora de Colombia, semana lunes-domingo y meses correctos', async () => {
  const { db, admin } = await setup();
  const gas = await inv.createItem(db, admin, { name: 'Gaseosa', category: 'Bebidas', unit: 'unidad', qty: 500, min: 0 });
  const p = await prod.createProduct(db, { name: 'Gaseosa', category: 'Bebidas', type: 'directo', recipe: [{ item_id: gas.id, qty: 1, unit: 'unidad' }] });
  const sell = async (at: string, n: number) => await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: p.id, qty: n }] }, { at });

  // 2026-10-13 03:00 UTC = 12 oct 22:00 en Colombia -> cuenta para el 12.
  await sell('2026-10-13T03:00:00.000Z', 1);
  await sell('2026-10-13T18:00:00.000Z', 2); // martes 13
  await sell('2026-10-18T20:00:00.000Z', 4); // domingo 18 (misma semana)
  await sell('2026-10-19T16:00:00.000Z', 8); // lunes 19 (semana siguiente)
  await sell('2026-09-30T20:00:00.000Z', 16); // septiembre
  await sell('2026-10-01T15:00:00.000Z', 32); // 1 de octubre (jueves, semana del 28 sep)

  assert.equal((await reports.periodReport(db, 'dia', '2026-10-12')).total, 1);
  const day = await reports.periodReport(db, 'dia', '2026-10-13');
  assert.equal(day.total, 2);
  assert.equal(day.prevTotal, 1);

  const DESPUES = '2026-12-01'; // «hoy» ya pasado: los períodos están completos
  const week = await reports.periodReport(db, 'semana', '2026-10-15', DESPUES);
  assert.deepEqual(week.range, { from: '2026-10-12', to: '2026-10-18' });
  assert.equal(week.total, 1 + 2 + 4);
  assert.equal(week.evolution.length, 7);
  assert.equal(week.evolution[0].units, 1);

  const month = await reports.periodReport(db, 'mes', '2026-10-05', DESPUES);
  assert.deepEqual(month.range, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(month.total, 1 + 2 + 4 + 8 + 32);
  assert.equal(month.prevTotal, 16);
  assert.deepEqual(month.prev, { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(month.evolution[0].from, '2026-10-01');
  assert.equal(month.evolution[0].to, '2026-10-04'); // semana cortada al inicio del mes
  assert.equal(month.evolution.at(-1)?.to, '2026-10-31');
  assert.equal(month.evolution.reduce((s, w) => s + w.units, 0), month.total);

  // Período en curso: se compara contra los mismos días del anterior (1–5 de septiembre, no el mes entero).
  const monthSoFar = await reports.periodReport(db, 'mes', '2026-10-05', '2026-10-05');
  assert.deepEqual(monthSoFar.prev, { from: '2026-09-01', to: '2026-09-05' });
  assert.equal(monthSoFar.prevTotal, 0);
  assert.deepEqual((await reports.periodReport(db, 'semana', '2026-10-14', '2026-10-14')).prev, { from: '2026-10-05', to: '2026-10-07' });

  const prevWeek = await reports.periodReport(db, 'semana', '2026-10-01', DESPUES);
  assert.deepEqual(prevWeek.range, { from: '2026-09-28', to: '2026-10-04' });
  assert.equal(prevWeek.total, 16 + 32);
});

test('11. los datos persisten al cerrar y volver a abrir la base de datos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pizza-diana-'));
  const file = join(dir, 'test.db');
  try {
    let db = await openDb(file);
    const admin = await users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
    const k = await pizzaKit(db, admin);
    await sales.registerSale(db, admin, { requestId: rid(), items: [{ productId: k.pizza.id, qty: 2 }] });
    await db.close();

    db = await openDb(file);
    assert.equal((await inv.getItem(db, k.masa.id)).qty_m, 8_000);
    assert.equal((await sales.listSales(db, admin, {})).length, 1);
    assert.equal((await users.authenticate(db, 'admin', 'clave-segura-1')).name, 'Admin');
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contraseñas guardadas con hash, nunca en texto plano', async () => {
  const { db } = await setup();
  const row = await db.prepare('SELECT pass_hash FROM users').get() as { pass_hash: string };
  assert.ok(row.pass_hash.startsWith('scrypt$'));
  assert.ok(!row.pass_hash.includes('clave-segura-1'));
  await assert.rejects(async () => await users.authenticate(db, 'admin', 'otra'), /incorrectos/);
  await assert.rejects(async () => await users.setupAdmin(db, { username: 'otro', name: 'X', password: '12345678' }), /ya tiene/);
});

test('datos DEMO: coherentes, separados de los reales y se pueden restablecer', async () => {
  const { db, admin } = await setup();
  await demo.loadDemo(db, admin);
  const st = await demo.demoStatus(db);
  assert.ok(st.demoMode);
  assert.ok(st.demo.sales > 100);
  // Las unidades de las ventas coinciden con lo que muestran los reportes.
  const sum = (await db.prepare("SELECT SUM(qty) n FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='confirmada'").get() as { n: number }).n;
  const series = await reports.dailySeries(db, { from: '2000-01-01', to: localDate() });
  assert.equal(series.reduce((s, d) => s + d.units, 0), sum);
  // Cada existencia es igual a la suma de sus movimientos (nada cambió en silencio).
  for (const it of await inv.listItems(db)) {
    const m = (await db.prepare('SELECT COALESCE(SUM(delta_m),0) n FROM movements WHERE item_id = ?').get(it.id) as { n: number }).n;
    assert.equal(m, it.qty_m, it.name);
  }
  assert.ok((await reports.alerts(db)).length >= 3);
  // No se puede cargar encima.
  await assert.rejects(async () => await demo.loadDemo(db, admin), /ya está cargada/);
  await demo.resetDemo(db, admin);
  assert.equal((await demo.demoStatus(db)).demo.sales, st.demo.sales);
  await demo.clearDemo(db);
  const empty = await demo.demoStatus(db);
  assert.equal(empty.demo.items + empty.demo.sales + empty.demo.products, 0);
  assert.equal((await users.listUsers(db)).length, 1);

  // Con datos reales, la demo no se carga.
  await inv.createItem(db, admin, { name: 'Real', category: 'Otros', unit: 'unidad', qty: 1, min: 0 });
  await assert.rejects(async () => await demo.loadDemo(db, admin), /información real/);
});
