// Pruebas del módulo de cocina: preparaciones, bajas, faltantes, conteos, plan y roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

async function setup() {
  const db = await openDb(':memory:');
  const admin = await users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  const cook = await users.createUser(db, { username: 'carlos', name: 'Carlos', role: 'cocina', password: 'clave-cocina-1' });
  const cashier = await users.createUser(db, { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  return { db, admin, cook, cashier };
}

const qty = async (db: DB, id: number) => (await inv.getItem(db, id)).qty_m;

/** Cebolla (insumo) con dos destinos: picada y caramelizada. */
async function onionKit(db: DB, admin: users.User) {
  const cebolla = await inv.createItem(db, admin, { name: 'Cebolla', category: 'Verduras y frutas', unit: 'kg', qty: 5, min: 1, location: 'Nevera Coca-Cola' });
  const caramelizada = await inv.createItem(db, admin, { name: 'Cebolla caramelizada', category: 'Verduras y frutas', unit: 'g', qty: 0, min: 300, location: 'Nevera negra' });
  const picada = await inv.createItem(db, admin, { name: 'Cebolla picada', category: 'Verduras y frutas', unit: 'g', qty: 0, min: 300, location: 'Nevera negra' });
  const carame = await preps.createPreparation(db, {
    name: 'Cebolla caramelizada',
    mode: 'transformacion',
    output_item_id: caramelizada.id,
    std_output: 450,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1000, unit: 'g' }],
  });
  const pica = await preps.createPreparation(db, {
    name: 'Cebolla picada',
    mode: 'transformacion',
    output_item_id: picada.id,
    std_output: 850,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1, unit: 'kg' }],
  });
  return { cebolla, caramelizada, picada, carame, pica };
}

test('13. una preparación descuenta el insumo, suma el resultado y calcula merma y rendimiento', async () => {
  const { db, admin, cook } = await setup();
  const k = await onionKit(db, admin);
  assert.equal(k.carame.std_yield_pct, 45);
  assert.equal((await inv.getItem(db, k.caramelizada.id)).kind, 'preparacion');

  // Hoja de merma: 1000 g de cebolla, 50 g de merma útil, salen 400 g → merma inútil 550 g.
  const p = await preps.registerProduction(db, cook, {
    preparation_id: k.carame.id,
    input_qty: 1000,
    input_unit: 'g',
    output_qty: 400,
    output_unit: 'g',
    merma_util_qty: 50,
  });
  assert.equal(await qty(db, k.cebolla.id), 4_000_000);
  assert.equal(await qty(db, k.caramelizada.id), 400_000);
  assert.equal(p.merma_util_m, 50_000);
  assert.equal(p.merma_inutil_m, 550_000);
  assert.equal(p.yield_pct, 40);
  assert.equal(p.expected_m, 450_000);
  assert.equal(p.efficiency_pct, 88.9);
  assert.equal(p.low, true); // por debajo del 90 % del estándar

  // La misma cebolla sirve para la otra preparación.
  await preps.registerProduction(db, cook, { preparation_id: k.pica.id, input_qty: 2, input_unit: 'kg', output_qty: 1.7, output_unit: 'kg' });
  assert.equal(await qty(db, k.cebolla.id), 2_000_000);
  assert.equal(await qty(db, k.picada.id), 1_700_000);

  // Si no alcanza la cebolla, no se registra nada.
  await assert.rejects(async () => await preps.registerProduction(db, cook, { preparation_id: k.pica.id, input_qty: 3, input_unit: 'kg', output_qty: 2, output_unit: 'kg' }), /No alcanza/);
  assert.equal(await qty(db, k.cebolla.id), 2_000_000);

  // Anular devuelve todo.
  await preps.annulProduction(db, admin, p.id, { reason: 'Se registró dos veces' });
  assert.equal(await qty(db, k.cebolla.id), 3_000_000);
  assert.equal(await qty(db, k.caramelizada.id), 0);
  // Cada existencia sigue siendo la suma de sus movimientos.
  for (const it of await inv.listItems(db)) {
    const m = (await db.prepare('SELECT COALESCE(SUM(delta_m),0) n FROM movements WHERE item_id = ?').get(it.id) as { n: number }).n;
    assert.equal(m, it.qty_m, it.name);
  }
});

test('14. receta por lote: la masa escala según la harina y compara contra el rendimiento estándar', async () => {
  const { db, admin, cook } = await setup();
  const harina = await inv.createItem(db, admin, { name: 'Harina', category: 'Abarrotes', unit: 'kg', qty: 20, min: 5 });
  const levadura = await inv.createItem(db, admin, { name: 'Levadura', category: 'Abarrotes', unit: 'g', qty: 500, min: 50 });
  const sal = await inv.createItem(db, admin, { name: 'Sal', category: 'Abarrotes', unit: 'g', qty: 1000, min: 50 });
  const masa = await inv.createItem(db, admin, { name: 'Masa', category: 'Masas y panes', unit: 'kg', qty: 0, min: 2 });
  const receta = await preps.createPreparation(db, {
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
  const p = await preps.registerProduction(db, cook, {
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
  assert.equal(await qty(db, harina.id), 10_000_000);
  assert.equal(await qty(db, levadura.id), 440_000);
  assert.equal(await qty(db, masa.id), 15_430_000);
  // Un ingrediente que no está en la receta no se acepta.
  await assert.rejects(
    async () => await preps.registerProduction(db, cook, { preparation_id: receta.id, inputs: [{ item_id: masa.id, qty: 1, unit: 'kg' }], output_qty: 1, output_unit: 'kg' }),
    /no hace parte/,
  );
});

test('15. bajas: pendiente no descuenta, aprobada descuenta, rechazada no', async () => {
  const { db, admin, cook } = await setup();
  const tomate = await inv.createItem(db, admin, { name: 'Tomate', category: 'Verduras y frutas', unit: 'kg', qty: 2, min: 0.5 });
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  const w1 = await wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 100, unit: 'g', reason: 'danado', note: 'Poca rotación y moho', photo });
  assert.equal(w1.status, 'pendiente');
  assert.equal(w1.has_photo, true);
  assert.equal(await qty(db, tomate.id), 2_000_000);
  // La caja solo vería las suyas; la cocina y el administrador, todas.
  assert.equal((await wastes.listWastes(db, cook, {})).length, 1);
  assert.equal((await wastes.getWastePhoto(db, admin, w1.id)).photo, photo);

  await wastes.reviewWaste(db, admin, w1.id, { decision: 'aprobar' });
  assert.equal(await qty(db, tomate.id), 1_900_000);
  await assert.rejects(async () => await wastes.reviewWaste(db, admin, w1.id, { decision: 'aprobar' }), /ya fue revisada/);

  const w2 = await wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 0.3, unit: 'kg', reason: 'vencido' });
  await assert.rejects(async () => await wastes.reviewWaste(db, admin, w2.id, { decision: 'rechazar' }), /Explica/);
  await wastes.reviewWaste(db, admin, w2.id, { decision: 'rechazar', note: 'Ese tomate sí sirve' });
  assert.equal(await qty(db, tomate.id), 1_900_000);

  // La baja del administrador queda aprobada de una vez.
  const w3 = await wastes.reportWaste(db, admin, { item_id: tomate.id, qty: 200, unit: 'g', reason: 'accidente' });
  assert.equal(w3.status, 'aprobada');
  assert.equal(await qty(db, tomate.id), 1_700_000);
  await assert.rejects(async () => await wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 1, unit: 'kg', reason: 'otro' }), /Explica/);
  await assert.rejects(async () => await wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 1, unit: 'kg', reason: 'vencido', photo: 'data:text/html;base64,AAAA' }), /foto/);
});

test('16. faltantes: no se duplican, entran a la lista de compras y se cierran al registrar la entrada', async () => {
  const { db, admin, cook, cashier } = await setup();
  const lechuga = await inv.createItem(db, admin, { name: 'Lechuga', category: 'Verduras y frutas', unit: 'g', qty: 400, min: 300 });
  const queso = await inv.createItem(db, admin, { name: 'Queso', category: 'Lácteos', unit: 'kg', qty: 1, min: 2 }); // bajo el mínimo
  const a = await shortages.reportShortage(db, cook, { item_id: lechuga.id, level: 'poco' });
  const b = await shortages.reportShortage(db, cashier, { item_id: lechuga.id, level: 'agotado', note: 'Se acabó en la noche' });
  assert.equal(b.merged, true);
  assert.equal(b.id, a.id);
  assert.equal(b.level, 'agotado');
  assert.equal((await shortages.listShortages(db, {})).length, 1);

  const list = await shortages.shoppingList(db);
  assert.deepEqual(
    list.map((l) => l.name),
    ['Lechuga', 'Queso'],
  );
  assert.equal(list[1].suggested_m, 3_000_000); // para quedar en el doble del mínimo (4 kg)

  await shortages.setShortageStatus(db, admin, a.id, { status: 'pedido' });
  await assert.rejects(async () => await shortages.setShortageStatus(db, admin, a.id, { status: 'recibido' }), /entrada/);
  await inv.registerEntry(db, admin, lechuga.id, { qty: 1, unit: 'kg', reason: 'Llegó el pedido' });
  assert.equal((await shortages.getShortage(db, a.id)).status, 'recibido');
  assert.deepEqual(
    (await shortages.shoppingList(db)).map((l) => l.name),
    ['Queso'],
  );
  void queso;
});

test('17. conteo por nevera: la cocina envía, el administrador aplica solo la diferencia', async () => {
  const { db, admin, cook, cashier } = await setup();
  const peperoni = await inv.createItem(db, admin, {
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
  const jamon = await inv.createItem(db, admin, { name: 'Jamón', category: 'Carnes y embutidos', unit: 'kg', qty: 2, min: 1, location: 'Congelador' });
  assert.equal(peperoni.pack_size_m, 500_000);
  assert.deepEqual(
    (await counts.countSheet(db, 'Congelador')).lines.map((l) => l.name),
    ['Jamón', 'Pepperoni'],
  );

  // 5 paquetes + 270 g de pepperoni = 2,77 kg (faltan 230 g); el jamón está completo.
  const c = await counts.submitCount(db, cook, {
    location: 'Congelador',
    lines: [
      { item_id: peperoni.id, qty: 2770, unit: 'g' },
      { item_id: jamon.id, qty: 2, unit: 'kg' },
    ],
  });
  assert.equal(c.status, 'pendiente');
  assert.equal(c.diff_count, 1);
  assert.equal(await qty(db, peperoni.id), 3_000_000); // aún no cambia

  // Mientras el administrador revisa, se gastan 200 g en una venta: no se debe contar dos veces.
  const pizza = await prod.createProduct(db, { name: 'Pizza', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: peperoni.id, qty: 200, unit: 'g' }] });
  await sales.registerSale(db, cashier, { requestId: 'conteo-1', items: [{ productId: pizza.id, qty: 1 }] });
  await counts.reviewCount(db, admin, c.id, { decision: 'aplicar' });
  assert.equal(await qty(db, peperoni.id), 2_570_000); // 3 kg − 230 g de diferencia − 200 g vendidos
  assert.equal(await qty(db, jamon.id), 2_000_000);
  assert.equal((await counts.getCount(db, admin, c.id)).status, 'aplicado');
  await assert.rejects(async () => await counts.submitCount(db, cook, { location: 'Nevera negra', lines: [{ item_id: jamon.id, qty: 1 }] }), /no está en Nevera negra/);
});

test('18. plan de preparación: la tarea del día se marca hecha al preparar y se copia a la semana siguiente', async () => {
  const { db, admin, cook } = await setup();
  const k = await onionKit(db, admin);
  const today = localDate();
  const t = await plan.addTask(db, admin, { date: today, preparation_id: k.carame.id, target_qty: 900, target_unit: 'g' });
  assert.equal(t.production_id, null);
  assert.equal(t.target_m, 900_000);
  const p = await preps.registerProduction(db, cook, { preparation_id: k.carame.id, input_qty: 2, input_unit: 'kg', output_qty: 900, output_unit: 'g' });
  const done = await plan.getTask(db, t.id);
  assert.equal(done.production_id, p.id);
  assert.equal(done.done_by_name, 'Carlos');
  await assert.rejects(async () => await plan.deleteTask(db, t.id), /ya se hizo/);
  assert.equal((await kitchen.kitchenToday(db, cook)).tasks.length, 1);

  const next = await plan.copyPreviousWeek(db, admin, addDays((await plan.weekPlan(db, today)).to, 1));
  assert.equal(next.added, 1);
  assert.equal(next.tasks[0].production_id, null);
});

test('19. tablero y reporte de cocina', async () => {
  const { db, admin, cook } = await setup();
  const k = await onionKit(db, admin);
  await preps.registerProduction(db, cook, { preparation_id: k.carame.id, input_qty: 1, input_unit: 'kg', output_qty: 300, output_unit: 'g' });
  await wastes.reportWaste(db, cook, { item_id: k.cebolla.id, qty: 100, unit: 'g', reason: 'danado' });
  await shortages.reportShortage(db, cook, { item_id: k.cebolla.id, level: 'poco' });
  await inv.registerEntry(db, admin, k.cebolla.id, { qty: 2, unit: 'kg', reason: 'Compra' });
  const s = await reports.kitchenSummary(db);
  assert.equal(s.pendingWastes, 1);
  assert.equal(s.openShortages, 0); // la entrada cerró el faltante
  assert.equal(s.productionsWeek, 1);
  assert.equal(s.lowYield.length, 1);
  const r = await reports.kitchenReport(db, 'dia', localDate());
  assert.equal(r.productions[0].count, 1);
  assert.equal(r.entries[0].total_m, 2_000_000);
});

test('20. catálogo Pizza Diana: carga productos, preparaciones y menú sin duplicar', async () => {
  const { db, admin } = await setup();
  const first = await kitchen.loadCatalog(db, admin);
  assert.ok(first.items > 40);
  assert.equal(first.preparations, 11);
  assert.ok(first.products >= 10);
  assert.ok((await inv.listItems(db)).every((i) => i.qty_m === 0));
  const cebolla = (await inv.listItems(db)).find((i) => i.name === 'Cebolla')!;
  // La cebolla es la base de tres preparaciones (caramelizada, picada y el adobo).
  assert.equal((await preps.listPreparations(db)).filter((p) => p.inputs[0].item_id === cebolla.id).length, 3);
  const again = await kitchen.loadCatalog(db, admin);
  assert.deepEqual(again, { items: 0, preparations: 0, products: 0 });
});

test('23. caja vs cocina: compara lo que descontaron las ventas con lo que se gastó entre apertura y cierre', async () => {
  const { db, admin, cook, cashier } = await setup();
  const queso = await inv.createItem(db, admin, { name: 'Queso', category: 'Lácteos', unit: 'kg', qty: 5, min: 1, location: 'Nevera Coca-Cola' });
  const tomate = await inv.createItem(db, admin, { name: 'Tomate', category: 'Verduras y frutas', unit: 'kg', qty: 2, min: 0.5, location: 'Nevera Coca-Cola' });
  const pizza = await prod.createProduct(db, { name: 'Pizza', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: queso.id, qty: 200, unit: 'g' }] });
  const day = '2026-10-14';
  const at = (h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`).toISOString();

  // Apertura: hay lo que dice el sistema.
  const open = await counts.submitCount(
    db,
    cook,
    { location: 'Nevera Coca-Cola', kind: 'apertura', lines: [{ item_id: queso.id, qty: 5, unit: 'kg' }, { item_id: tomate.id, qty: 2, unit: 'kg' }] },
    { at: at(8) },
  );
  assert.equal(open.kind, 'apertura');
  await counts.reviewCount(db, admin, open.id, { decision: 'aplicar' }, { at: at(8, 5) });
  // Durante el día: llega 1 kg de queso, se venden 10 pizzas (2 kg de queso según receta), se bota 100 g de tomate.
  await inv.registerEntry(db, admin, queso.id, { qty: 1, unit: 'kg', reason: 'Compra' }, { at: at(10) });
  await sales.registerSale(db, cashier, { requestId: 'recon-0001', items: [{ productId: pizza.id, qty: 10 }] }, { at: at(13) });
  const one = await sales.registerSale(db, cashier, { requestId: 'recon-0002', items: [{ productId: pizza.id, qty: 1 }] }, { at: at(14) });
  await sales.annulSale(db, admin, one.sale.id, { reason: 'Error de caja' }, { at: at(14, 5) });
  const w = await wastes.reportWaste(db, cook, { item_id: tomate.id, qty: 100, unit: 'g', reason: 'danado' }, { at: at(15) });
  await wastes.reviewWaste(db, admin, w.id, { decision: 'aprobar' }, { at: at(15, 5) });
  // Cierre: quedan 3,6 kg de queso (se gastaron 2,4 kg: 400 g más de lo que dicen las recetas) y 1,9 kg de tomate.
  await counts.submitCount(
    db,
    cook,
    { location: 'Nevera Coca-Cola', kind: 'cierre', lines: [{ item_id: queso.id, qty: 3.6, unit: 'kg' }, { item_id: tomate.id, qty: 1.9, unit: 'kg' }] },
    { at: at(23) },
  );

  const r = await counts.reconciliation(db, day);
  assert.equal(r.status[0].apertura?.id, open.id);
  const q = r.lines.find((l) => l.item_id === queso.id)!;
  assert.equal(q.open_m, 5_000_000);
  assert.equal(q.entries_m, 1_000_000);
  assert.equal(q.sales_m, 2_000_000); // la venta anulada no cuenta
  assert.equal(q.real_m, 2_400_000);
  assert.equal(q.diff_m, 400_000);
  const t = r.lines.find((l) => l.item_id === tomate.id)!;
  assert.equal(t.waste_m, 100_000);
  assert.equal(t.real_m, 0); // la baja explica todo lo que falta
  assert.equal(t.diff_m, 0);
  // Sin cierre no hay comparación.
  assert.equal((await counts.reconciliation(db, '2026-10-13')).lines.length, 0);
});

test('24. hoja de inventario diario: inicio, entrada, fin y consumo como en el papel', async () => {
  const { db, admin, cook, cashier } = await setup();
  const queso = await inv.createItem(db, admin, { name: 'Queso', category: 'Lácteos', unit: 'kg', qty: 5, min: 1, location: 'Nevera Coca-Cola', pack_size: 1000, pack_unit: 'g' });
  const pizza = await prod.createProduct(db, { name: 'Pizza', category: 'Pizzas', type: 'preparado', recipe: [{ item_id: queso.id, qty: 200, unit: 'g' }] });
  const day = '2026-10-14';
  const at = (h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00-05:00`).toISOString();
  const count = async (kind: string, kg: number, h: number) =>
    await counts.submitCount(db, cook, { location: 'Nevera Coca-Cola', kind, lines: [{ item_id: queso.id, qty: kg, unit: 'kg' }] }, { at: at(h) });

  const first = await count('apertura', 4.8, 8);
  // El cocinero corrige el inicio: el anterior (sin revisar) queda reemplazado, no se aplican los dos.
  const fixed = await count('apertura', 5, 9);
  assert.equal((await counts.getCount(db, admin, first.id)).status, 'descartado');
  await counts.reviewCount(db, admin, fixed.id, { decision: 'aplicar' });
  await inv.registerEntry(db, admin, queso.id, { qty: 2, unit: 'kg', reason: 'Compra' }, { at: at(10) });
  await sales.registerSale(db, cashier, { requestId: 'hoja-0001', items: [{ productId: pizza.id, qty: 5 }] }, { at: at(13) });
  await count('cierre', 5.9, 23);

  const sheet = await counts.inventorySheet(db, admin, day);
  const line = sheet.sections.find((s) => s.location === 'Nevera Coca-Cola')!.lines[0];
  assert.equal(line.open_m, 5_000_000);
  assert.equal(line.entries_m, 2_000_000);
  assert.equal(line.close_m, 5_900_000);
  assert.equal(line.consumption_m, 1_100_000); // 5 + 2 − 5,9
  assert.equal(line.sales_m, 1_000_000); // 5 pizzas × 200 g
  assert.equal(line.pack_size_m, 1_000_000);
  // La cocina no ve lo que descontó caja; al día siguiente le sale el fin de ayer para copiar.
  assert.equal((await counts.inventorySheet(db, cook, day)).sections[0].lines[0].sales_m, null);
  assert.equal((await counts.inventorySheet(db, cook, '2026-10-15')).sections[0].lines[0].prev_close_m, 5_900_000);
});
