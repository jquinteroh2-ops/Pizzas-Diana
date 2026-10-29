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

function setup() {
  const db = openDb(':memory:');
  const admin = users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  const jefa = users.createUser(db, { username: 'marta', name: 'Marta', role: 'cocina', password: 'clave-cocina-1' });
  const caja = users.createUser(db, { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  // Cebolla → cebolla caramelizada; la hamburguesa lleva carne (por unidad), queso (gramos) y cebolla caramelizada.
  const cebolla = inv.createItem(db, admin, { name: 'Cebolla', category: 'Verduras y frutas', unit: 'kg', qty: 5, location: 'Nevera Coca-Cola' });
  const carame = inv.createItem(db, admin, { name: 'Cebolla caramelizada', category: 'Verduras y frutas', unit: 'g', qty: 0, location: 'Nevera negra', kind: 'preparacion' });
  const carne = inv.createItem(db, admin, { name: 'Carne de hamburguesa', category: 'Carnes y embutidos', unit: 'unidad', qty: 20, location: 'Congelador' });
  const queso = inv.createItem(db, admin, {
    name: 'Queso',
    category: 'Lácteos',
    unit: 'g',
    qty: 3000,
    location: 'Nevera Coca-Cola',
    pack_size: 1000,
    pack_unit: 'g',
    pack_label: 'bloque',
  });
  const prep = preps.createPreparation(db, {
    name: 'Cebolla caramelizada',
    mode: 'transformacion',
    output_item_id: carame.id,
    std_output: 450,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.id, qty: 1000, unit: 'g' }],
  });
  const hamb = prod.createProduct(db, {
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

const qty = (db: DB, id: number) => inv.getItem(db, id).qty_m;
const lineOf = (s: ReturnType<typeof sheet.getDaySheet>, id: number) => s.lines.find((l) => l.item_id === id)!;
let n = 0;
const rid = () => `req-hoja-${++n}-${Date.now()}`;

test('hoja: el consumo se calcula solo (inicio + llegó + preparado − usado − bajas − fin) y se compara con la caja', () => {
  const k = setup();
  const { db, jefa, caja } = k;
  const today = localDate();
  const cell = (item_id: number, field: string, value_m: number | null) => sheet.setCell(db, jefa, { date: today, item_id, field, value_m });

  // Al abrir: lo que hay.
  cell(k.carne.id, 'open', 20_000);
  cell(k.queso.id, 'open', 3_000_000);
  cell(k.cebolla.id, 'open', 5_000_000);
  cell(k.carame.id, 'open', 0);
  // Llegaron 10 carnes: entra al inventario de una vez.
  cell(k.carne.id, 'entry', 10_000);
  assert.equal(qty(db, k.carne.id), 30_000);
  // Corregir lo que llegó (eran 8) ajusta la diferencia, no suma otra vez.
  cell(k.carne.id, 'entry', 8_000);
  assert.equal(qty(db, k.carne.id), 28_000);

  // Cebolla caramelizada: 1 kg de cebolla → 450 g.
  preps.registerProduction(db, jefa, { preparation_id: k.prep.id, input_qty: 1000, input_unit: 'g', output_qty: 450, output_unit: 'g' });
  // La caja vende 5 hamburguesas.
  sales.registerSale(db, caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 5 }] });

  // Al cerrar: la carne cuadra (28 − 5 = 23); del queso se gastaron 30 g de más.
  cell(k.carne.id, 'close', 23_000);
  cell(k.queso.id, 'close', 2_720_000);
  cell(k.cebolla.id, 'close', 4_000_000);
  cell(k.carame.id, 'close', 250_000);

  const s = sheet.getDaySheet(db, jefa, today);
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

test('hoja: validar deja la existencia igual a lo contado al cerrar, sin perder ventas posteriores; reabrir lo deshace', () => {
  const k = setup();
  const { db, jefa, caja, admin } = k;
  const today = localDate();
  sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'open', value_m: 3_000_000 });
  // El sistema cree que hay 3000 g; al cerrar hay 2900 g.
  sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'close', value_m: 2_900_000 });
  // Después de contar se vende una hamburguesa más (50 g de queso).
  sales.registerSale(db, caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 1 }] });
  assert.equal(qty(db, k.queso.id), 2_950_000);

  const s = sheet.validateDay(db, jefa, { date: today, note: 'Todo bien' });
  assert.equal(s.status, 'validada');
  assert.equal(s.validated_by_name, 'Marta');
  // 2900 contados − 50 de la venta posterior.
  assert.equal(qty(db, k.queso.id), 2_850_000);

  // Validada: ya no se puede escribir.
  assert.throws(() => sheet.setCell(db, jefa, { date: today, item_id: k.queso.id, field: 'close', value_m: 1 }), /validada/);
  // Solo el administrador la vuelve a abrir, y se deshace el ajuste.
  assert.equal(can(jefa, 'sheet.reopen'), false);
  assert.equal(can(admin, 'sheet.reopen'), true);
  assert.equal(can(caja, 'sheet.use'), false);
  sheet.reopenDay(db, admin, { date: today });
  assert.equal(qty(db, k.queso.id), 2_950_000);
  // Validar otra vez da el mismo resultado (no se ajusta dos veces).
  sheet.validateDay(db, jefa, { date: today });
  assert.equal(qty(db, k.queso.id), 2_850_000);
});

test('hoja: el inicio se copia del fin del día anterior y las bajas se restan del consumo', () => {
  const k = setup();
  const { db, jefa, admin } = k;
  const today = localDate();
  const ayer = addDays(today, -1);
  sheet.setCell(db, jefa, { date: ayer, item_id: k.carne.id, field: 'close', value_m: 18_000 });
  sheet.setCell(db, jefa, { date: ayer, item_id: k.queso.id, field: 'close', value_m: 2_500_000 });
  const s = sheet.fillOpen(db, jefa, { date: today, source: 'ayer' });
  assert.equal(lineOf(s, k.carne.id).open_m, 18_000);
  assert.equal(lineOf(s, k.queso.id).open_m, 2_500_000);
  assert.equal(lineOf(s, k.cebolla.id).open_m, null);
  // Con lo del sistema se llena lo que faltaba.
  const s2 = sheet.fillOpen(db, jefa, { date: today, source: 'sistema' });
  assert.equal(lineOf(s2, k.cebolla.id).open_m, 5_000_000);
  assert.equal(lineOf(s2, k.carne.id).open_m, 18_000);

  // Una baja autorizada (3 carnes dañadas) no es consumo de platos.
  const w = wastes.reportWaste(db, jefa, { item_id: k.carne.id, qty: 3, unit: 'unidad', reason: 'danado', note: '' });
  wastes.reviewWaste(db, admin, w.id, { decision: 'aprobar' });
  sheet.setCell(db, jefa, { date: today, item_id: k.carne.id, field: 'close', value_m: 15_000 });
  const l = lineOf(sheet.getDaySheet(db, jefa, today), k.carne.id);
  assert.equal(l.waste_m, 3_000);
  assert.equal(l.consumption_m, 0);
  assert.equal(l.diff_level, 'ok');
});

test('hoja: no se llena un día futuro y lo que llegó solo se anota el mismo día', () => {
  const k = setup();
  const today = localDate();
  assert.throws(() => sheet.setCell(k.db, k.jefa, { date: addDays(today, 1), item_id: k.carne.id, field: 'open', value_m: 1 }), /no ha llegado/);
  assert.throws(() => sheet.setCell(k.db, k.jefa, { date: addDays(today, -1), item_id: k.carne.id, field: 'entry', value_m: 1000 }), /mismo día/);
  assert.throws(() => sheet.validateDay(k.db, k.jefa, { date: today }), /Fin/);
});

test('la jefa de cocina agrega ingredientes y cambia su unidad: de gramos a unidades se convierte todo', () => {
  const k = setup();
  const { db, jefa } = k;
  const nuevo = sheet.addIngredient(db, jefa, { name: 'Butifarra', location: 'Congelador', unit: 'unidad', pack_size: 10, pack_label: 'paquete' });
  assert.equal(nuevo.location, 'Congelador');
  assert.equal(nuevo.qty_m, 0);
  assert.equal(nuevo.pack_size_m, 10_000);

  // El queso pasa de gramos a "unidades" de 250 g: existencia, receta y paquete se convierten.
  const q = sheet.editIngredient(db, k.queso.id, { unit: 'unidad', per_unit: 250 });
  assert.equal(q.base_unit, 'unidad');
  assert.equal(q.qty_m, 12_000); // 3000 g / 250 g = 12 unidades
  assert.equal(q.pack_size_m, 4_000); // el bloque de 1000 g = 4 unidades
  const recipe = prod.getProduct(db, k.hamb.id).recipe.find((r) => r.item_id === k.queso.id)!;
  assert.equal(recipe.qty_m, 200); // 50 g = 0,2 unidades
  // Sin decir cuánto pesa una unidad no se puede cambiar.
  assert.throws(() => sheet.editIngredient(db, k.carne.id, { unit: 'g' }), /pesa una unidad/);
  // Dentro de la misma familia (g → kg) no hace falta.
  const c = sheet.editIngredient(db, k.carame.id, { unit: 'kg' });
  assert.equal(c.unit, 'kg');
  // Una venta después del cambio descuenta en la nueva unidad.
  sales.registerSale(db, k.caja, { requestId: rid(), items: [{ productId: k.hamb.id, qty: 5 }] });
  assert.equal(qty(db, k.queso.id), 11_000);
});
