// Pruebas de la hoja del día: inicio, llegó, fin, consumo, comparación con la caja y validación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type DB } from '../server/db.ts';
import * as inv from '../server/services/inventory.ts';
import * as prod from '../server/services/products.ts';
import * as sales from '../server/services/sales.ts';
import * as preps from '../server/services/preparations.ts';
import * as wastes from '../server/services/wastes.ts';
import * as sheet from '../server/services/daySheet.ts';
import * as users from '../server/services/users.ts';
import { can } from '../shared/permissions.ts';
import { addDays, localDate } from '../shared/dates.ts';

async function setup() {
  const db = await openDb(':memory:');
  const admin = await users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  const jefa = await users.createUser(db, { username: 'marta', name: 'Marta', role: 'cocina', password: 'clave-cocina-1' });
  const caja = await users.createUser(db, { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  // Cebolla → cebolla caramelizada; la hamburguesa lleva carne (por unidad), queso (gramos) y cebolla caramelizada.
  const cebolla = await inv.createItem(db, admin, { name: 'Cebolla', category: 'Verduras y frutas', unit: 'kg', qty: 5, location: 'Nevera Coca-Cola' });
  const carame = await inv.createItem(db, admin, { name: 'Cebolla caramelizada', category: 'Verduras y frutas', unit: 'g', qty: 0, location: 'Nevera negra', kind: 'preparacion' });
  const carne = await inv.createItem(db, admin, { name: 'Carne de hamburguesa', category: 'Carnes y embutidos', unit: 'unidad', qty: 20, location: 'Congelador' });
  const queso = await inv.createItem(db, admin, {
    name: 'Queso',
    category: 'Lácteos',
    unit: 'g',
    qty: 3000,
    location: 'Nevera Coca-Cola',
    pack_size: 1000,
    pack_unit: 'g',
    pack_label: 'bloque',
  });
  const prep = await preps.createPreparation(db, {
    name: 'Cebolla caramelizada',
    mode: 'transformacion',
    output_item_id: carame.id,
    std_output: 450,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1000, unit: 'g' }],
  });
  const hamb = await prod.createProduct(db, {
    name: 'Hamburguesa',
    category: 'Hamburguesas',
    type: 'preparado',
    recipe: [
      { item_id: carne.id, qty: 1, unit: 'unidad' },
      { item_id: queso.id, qty: 50, unit: 'g' },
      { item_id: carame.id, qty: 40, unit: 'g' },
    ],
  });
  return { db, admin, jefa, caja, cebolla, carame, carne, queso, prep, hamb };
}

const qty = async (db: DB, id: number) => (await inv.getItem(db, id)).qty_m;
const lineOf = (s: Awaited<ReturnType<typeof sheet.getDaySheet>>, id: number) => s.lines.find((l) => l.item_id === id)!;
let n = 0;
const rid = () => `req-hoja-${++n}-${Date.now()}`;

test('hoja: el consumo se calcula solo (inicio + llegó + preparado − usado − bajas − fin) y se compara con la caja', async () => {
  const k = await setup();
  const { db, jefa, caja } = k;
  const today = localDate();
  const cell = async (item_id: number, field: string, value_m: number | null) => await sheet.setCell(db, jefa, { date: today, item_id, field, value_m });

  // Al abrir: lo que hay.
  await cell(k.carne.id, 'open', 20_000);
  await cell(k.queso.id, 'open', 3_000_000);
  await cell(k.cebolla.id, 'open', 5_000_000);
  await cell(k.carame.id, 'open', 0);
  // Llegaron 10 carnes: entra al inventario de una vez.
  await cell(k.carne.id, 'entry', 10_000);
  assert.equal(await qty(db, k.carne.id), 30_000);
  // Corregir lo que llegó (eran 8) ajusta la diferencia, no suma otra vez.
  await cell(k.carne.id, 'entry', 8_000);
  assert.equal(await qty(db, k.carne.id), 28_000);

  // Cebolla caramelizada: 1 kg de cebolla → 450 g.
  await preps.registerProduction(db, jefa, { preparation_id: k.prep.id, input_qty: 1000, input_unit: 'g', output_qty: 450, output_unit: 'g' });
  // La caja vende 5 hamburguesas.
  await sales.registerSale(db, caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 5 }] });

  // Al cerrar: la carne cuadra (28 − 5 = 23); del queso se gastaron 30 g de más.
  await cell(k.carne.id, 'close', 23_000);
  await cell(k.queso.id, 'close', 2_720_000);
  await cell(k.cebolla.id, 'close', 4_000_000);
  await cell(k.carame.id, 'close', 250_000);

  const s = await sheet.getDaySheet(db, jefa, today);
  const carne = lineOf(s, k.carne.id);
  assert.equal(carne.entries_m, 8_000);
  assert.equal(carne.consumption_m, 5_000);
  assert.equal(carne.sales_m, 5_000);
  assert.equal(carne.diff_level, 'ok');
  const queso = lineOf(s, k.queso.id);
  assert.equal(queso.consumption_m, 280_000);
  assert.equal(queso.sales_m, 250_000);
  assert.equal(queso.diff_m, 30_000);
  assert.equal(queso.diff_level, 'falta');
  // La cebolla que se usó para caramelizar NO cuenta como consumo de platos.
  const cebolla = lineOf(s, k.cebolla.id);
  assert.equal(cebolla.used_m, 1_000_000);
  assert.equal(cebolla.consumption_m, 0);
  // La caramelizada: 0 + 450 preparados − 250 al cerrar = 200 g gastados (las ventas dicen 200 g).
  const car = lineOf(s, k.carame.id);
  assert.equal(car.produced_m, 450_000);
  assert.equal(car.consumption_m, 200_000);
  assert.equal(car.sales_m, 200_000);
  assert.equal(s.sold_units, 5);
  assert.deepEqual(s.sold.map((p) => [p.product_name, p.qty]), [['Hamburguesa', 5]]);
  assert.equal(s.summary.to_review, 1);
});

test('hoja: validar deja la existencia igual a lo contado al cerrar, sin perder ventas posteriores; reabrir lo deshace', async () => {
  const k = await setup();
  const { db, jefa, caja, admin } = k;
  const today = localDate();
  await sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'open', value_m: 3_000_000 });
  // El sistema cree que hay 3000 g; al cerrar hay 2900 g.
  await sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'close', value_m: 2_900_000 });
  // Después de contar se vende una hamburguesa más (50 g de queso).
  await sales.registerSale(db, caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 1 }] });
  assert.equal(await qty(db, k.queso.id), 2_950_000);

  const s = await sheet.validateDay(db, jefa, { date: today, note: 'Todo bien' });
  assert.equal(s.status, 'validada');
  assert.equal(s.validated_by_name, 'Marta');
  // 2900 contados − 50 de la venta posterior.
  assert.equal(await qty(db, k.queso.id), 2_850_000);

  // Validada: ya no se puede escribir.
  await assert.rejects(async () => await sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'close', value_m: 1 }), /validada/);
  // Solo el administrador la vuelve a abrir, y se deshace el ajuste.
  assert.equal(can(jefa, 'sheet.reopen'), false);
  assert.equal(can(admin, 'sheet.reopen'), true);
  assert.equal(can(caja, 'sheet.use'), false);
  await sheet.reopenDay(db, admin, { date: today });
  assert.equal(await qty(db, k.queso.id), 2_950_000);
  // Validar otra vez da el mismo resultado (no se ajusta dos veces).
  await sheet.validateDay(db, jefa, { date: today });
  assert.equal(await qty(db, k.queso.id), 2_850_000);
});

test('hoja: el inicio se copia del fin del día anterior y las bajas se restan del consumo', async () => {
  const k = await setup();
  const { db, jefa, admin } = k;
  const today = localDate();
  const ayer = addDays(today, -1);
  await sheet.setCell(db, jefa, { date: ayer, item_id: k.carne.id, field: 'close', value_m: 18_000 });
  await sheet.setCell(db, jefa, { date: ayer, item_id: k.queso.id, field: 'close', value_m: 2_500_000 });
  const s = await sheet.fillOpen(db, jefa, { date: today, source: 'ayer' });
  assert.equal((lineOf(s, k.carne.id)).open_m, 18_000);
  assert.equal((lineOf(s, k.queso.id)).open_m, 2_500_000);
  assert.equal((lineOf(s, k.cebolla.id)).open_m, null);
  // Con lo del sistema se llena lo que faltaba.
  const s2 = await sheet.fillOpen(db, jefa, { date: today, source: 'sistema' });
  assert.equal((lineOf(s2, k.cebolla.id)).open_m, 5_000_000);
  assert.equal((lineOf(s2, k.carne.id)).open_m, 18_000);

  // Una baja autorizada (3 carnes dañadas) no es consumo de platos.
  const w = await wastes.reportWaste(db, jefa, { item_id: k.carne.id, qty: 3, unit: 'unidad', reason: 'danado', note: '' });
  await wastes.reviewWaste(db, admin, w.id, { decision: 'aprobar' });
  await sheet.setCell(db, jefa, { date: today, item_id: k.carne.id, field: 'close', value_m: 15_000 });
  const l = lineOf(await sheet.getDaySheet(db, jefa, today), k.carne.id);
  assert.equal(l.waste_m, 3_000);
  assert.equal(l.consumption_m, 0);
  assert.equal(l.diff_level, 'ok');
});

test('hoja: no se llena un día futuro y lo que llegó solo se anota el mismo día', async () => {
  const k = await setup();
  const today = localDate();
  await assert.rejects(async () => sheet.setCell(k.db, k.jefa, { date: addDays(today, 1), item_id: k.carne.id, field: 'open', value_m: 1 }), /no ha llegado/);
  await assert.rejects(async () => sheet.setCell(k.db, k.jefa, { date: addDays(today, -1), item_id: k.carne.id, field: 'entry', value_m: 1000 }), /mismo día/);
  await assert.rejects(async () => sheet.validateDay(k.db, k.jefa, { date: today }), /Fin/);
});

test('la jefa de cocina agrega ingredientes y cambia su unidad: de gramos a unidades se convierte todo', async () => {
  const k = await setup();
  const { db, jefa } = k;
  const nuevo = await sheet.addIngredient(db, jefa, { name: 'Butifarra', location: 'Congelador', unit: 'unidad', pack_size: 10, pack_label: 'paquete' });
  assert.equal(nuevo.location, 'Congelador');
  assert.equal(nuevo.qty_m, 0);
  assert.equal(nuevo.pack_size_m, 10_000);

  // El queso pasa de gramos a "unidades" de 250 g: existencia, receta y paquete se convierten.
  const q = await sheet.editIngredient(db, k.queso.id, { unit: 'unidad', per_unit: 250 });
  assert.equal(q.base_unit, 'unidad');
  assert.equal(q.qty_m, 12_000); // 3000 g / 250 g = 12 unidades
  assert.equal(q.pack_size_m, 4_000); // el bloque de 1000 g = 4 unidades
  const recipe = (await prod.getProduct(db, k.hamb.id)).recipe.find((r) => r.item_id === k.queso.id)!;
  assert.equal(recipe.qty_m, 200); // 50 g = 0,2 unidades
  // Sin decir cuánto pesa una unidad no se puede cambiar.
  await assert.rejects(async () => await sheet.editIngredient(db, k.carne.id, { unit: 'g' }), /pesa una unidad/);
  // Dentro de la misma familia (g → kg) no hace falta.
  const c = await sheet.editIngredient(db, k.carame.id, { unit: 'kg' });
  assert.equal(c.unit, 'kg');
  // Una venta después del cambio descuenta en la nueva unidad.
  await sales.registerSale(db, k.caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 5 }] });
  assert.equal(await qty(db, k.queso.id), 11_000);
});

test('la casilla de la hoja se lee como se escribe a mano: «3 paq + 385», «542 grs», «2 und»', async () => {
  const { parseSheetText } = await import('../shared/sheetText.ts');
  const pack = { unit: 'g', base_unit: 'g', pack_size_m: 1_000_000, pack_label: 'paquete' } as const;
  const kg = { unit: 'kg', base_unit: 'g', pack_size_m: 0, pack_label: '' } as const;
  const und = { unit: 'unidad', base_unit: 'unidad', pack_size_m: 10_000, pack_label: 'paquete' } as const;
  const ml = { unit: 'ml', base_unit: 'ml', pack_size_m: 0, pack_label: '' } as const;
  assert.equal(parseSheetText('3 paq + 385', pack), 3_385_000);
  assert.equal(parseSheetText('3pag + 785', pack), 3_785_000); // así se ve «paq» escrito a mano
  assert.equal(parseSheetText('3 + 385', pack), 3_385_000);
  assert.equal(parseSheetText('2 paq', pack), 2_000_000);
  assert.equal(parseSheetText('1 paq +', pack), 1_000_000);
  assert.equal(parseSheetText('542 grs', pack), 542_000);
  assert.equal(parseSheetText('3 paq + 385 g', pack), 3_385_000); // lo que muestra el sistema se vuelve a leer igual
  assert.equal(parseSheetText('1,085 kg', kg), 1_085_000);
  assert.equal(parseSheetText('518 grs', kg), 518_000);
  assert.equal(parseSheetText('1,2', kg), 1_200_000); // sin unidad: la del producto
  assert.equal(parseSheetText('2 paq + 5 und', und), 25_000);
  assert.equal(parseSheetText('24 und', und), 24_000);
  assert.equal(parseSheetText('2753 ml', ml), 2_753_000);
  assert.equal(parseSheetText('', pack), null);
  assert.ok(Number.isNaN(parseSheetText('mucho', pack)));
  assert.ok(Number.isNaN(parseSheetText('2 kg', und))); // un producto por unidades no se escribe en kilos
});

test('paquetes y unidades: «5 paq + 2 und + 30 g» en algo que se pesa (butifarra: paquete de 6, cada una de 32 g)', async () => {
  const { parseSheetText } = await import('../shared/sheetText.ts');
  const { formatPacks } = await import('../shared/kitchen.ts');
  const { guessItem } = await import('../shared/classify.ts');
  const { db, admin } = await setup();
  const buti = await sheet.addIngredient(db, admin, { name: 'Butifarra', location: 'Congelador', unit: 'g', unit_size: 32, pack_size: 6, pack_unit: 'unidad', pack_label: 'paquete' });
  assert.equal(buti.unit_size_m, 32_000);
  assert.equal(buti.pack_size_m, 192_000);
  assert.equal(buti.category, 'Carnes y embutidos'); // el sistema la clasificó solo
  const m = { unit: 'g' as const, base_unit: 'g' as const, pack_size_m: buti.pack_size_m, pack_label: 'paquete', unit_size_m: buti.unit_size_m };
  assert.equal(parseSheetText('5 paq + 2 und + 30 g', m), 5 * 192_000 + 2 * 32_000 + 30_000);
  assert.equal(parseSheetText('5 paq', m), 960_000);
  assert.equal(parseSheetText('3 und', m), 96_000);
  assert.equal(formatPacks(5 * 192_000 + 2 * 32_000 + 30_000, 192_000, 'paq', 'g', 32_000), '5 paq + 2 und + 30 g');
  // Lo que llegó: 5 paquetes entran como 960 g.
  await sheet.setCell(db, admin, { date: localDate(), item_id: buti.id, field: 'entry', value_m: parseSheetText('5 paq', m) });
  assert.equal(await qty(db, buti.id), 960_000);
  assert.equal(guessItem('Queso costeño')?.location, 'Nevera Coca-Cola');
  assert.equal(guessItem('Salsa de ajo')?.location, 'Nevera negra');
});

test('bajas: quien la anotó la corrige o la borra mientras no esté autorizada', async () => {
  const k = await setup();
  const { db, jefa, admin } = k;
  const w = await wastes.reportWaste(db, jefa, { item_id: k.queso.id, qty: 100, unit: 'g', reason: 'danado', note: 'moho' });
  assert.equal(await qty(db, k.queso.id), 2_900_000);
  await wastes.updateWaste(db, jefa, w.id, { qty: 250, unit: 'g' });
  assert.equal(await qty(db, k.queso.id), 2_750_000);
  await wastes.deleteWaste(db, jefa, w.id);
  assert.equal(await qty(db, k.queso.id), 3_000_000);
  const w2 = await wastes.reportWaste(db, jefa, { item_id: k.queso.id, qty: 50, unit: 'g', reason: 'danado', note: 'moho' });
  await wastes.reviewWaste(db, admin, w2.id, { decision: 'aprobar' });
  await assert.rejects(async () => wastes.updateWaste(db, jefa, w2.id, { qty: 10, unit: 'g' }), /ya fue revisada/);
});
