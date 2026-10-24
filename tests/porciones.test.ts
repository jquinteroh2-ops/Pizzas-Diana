// Pruebas de presentaciones, porcionado, recepción de pedidos y carnes frías por unidad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type DB } from '../server/db.ts';
import * as inv from '../server/services/inventory.ts';
import * as prod from '../server/services/products.ts';
import * as sales from '../server/services/sales.ts';
import * as shortages from '../server/services/shortages.ts';
import * as counts from '../server/services/counts.ts';
import * as portioning from '../server/services/portioning.ts';
import * as kitchen from '../server/services/kitchen.ts';
import * as preps from '../server/services/preparations.ts';
import * as users from '../server/services/users.ts';
import { detailText, openPack, presentationText } from '../shared/kitchen.ts';

async function setup() {
  const db = await openDb(':memory:');
  const admin = await users.setupAdmin(db, { username: 'admin', name: 'Admin', password: 'clave-segura-1' });
  const cook = await users.createUser(db, { username: 'carlos', name: 'Carlos', role: 'cocina', password: 'clave-cocina-1' });
  const cashier = await users.createUser(db, { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  return { db, admin, cook, cashier };
}

const qty = async (db: DB, id: number) => (await inv.getItem(db, id)).qty_m;

async function pechuga(db: DB, admin: users.User) {
  return await inv.createItem(db, admin, {
    name: 'Pechuga',
    category: 'Carnes y embutidos',
    unit: 'kg',
    qty: 5,
    min: 1,
    location: 'Congelador',
    pack_size: 2000,
    pack_unit: 'g',
    pack_label: 'bolsa',
    portions: [
      { label: 'porción picada', size: 80, unit: 'g' },
      { label: 'porción asado', size: 300, unit: 'g' },
    ],
  });
}

test('30. un artículo guarda cómo viene y sus porciones (sigue siendo un solo artículo)', async () => {
  const { db, admin } = await setup();
  const p = await pechuga(db, admin);
  assert.deepEqual(p.portions, [
    { label: 'porción picada', size_m: 80_000 },
    { label: 'porción asado', size_m: 300_000 },
  ]);
  assert.equal(presentationText(p), 'bolsa × 2.000 g');
  await assert.rejects(async () => await inv.updateItem(db, p.id, { portions: [{ label: 'x', size: 0 }] }), /mayor que cero/);
  await assert.rejects(async () => await inv.updateItem(db, p.id, { portions: [{ label: 'a', size: 1 }, { label: 'A', size: 2 }] }), /repetida/);
  // Se pueden quitar.
  assert.deepEqual((await inv.updateItem(db, p.id, { portions: [] })).portions, []);
});

test('31. porcionar solo descuenta la merma: las porciones siguen en el mismo artículo', async () => {
  const { db, admin, cook } = await setup();
  const p = await pechuga(db, admin);
  const r = await portioning.registerPortioning(db, cook, { item_id: p.id, portions: [10, 2], merma: 120 });
  assert.equal(r.output_m, 1_400_000); // 10 × 80 + 2 × 300
  assert.equal(r.merma_m, 120_000);
  assert.equal(r.yield_pct, 92.1);
  assert.equal(await qty(db, p.id), 5_000_000 - 120_000);
  assert.equal((await inv.listMovements(db, { type: 'porcionado' })).length, 1);
  await assert.rejects(async () => await portioning.registerPortioning(db, cook, { item_id: p.id, portions: [0, 0] }), /cuántas porciones/);
  await assert.rejects(async () => await portioning.registerPortioning(db, cook, { item_id: p.id, portions: [1], merma: 500 }), /merma es más/);
  // Anular devuelve la merma.
  await portioning.annulPortioning(db, admin, r.id, { reason: 'Me equivoqué' });
  assert.equal(await qty(db, p.id), 5_000_000);
  assert.equal((await portioning.listPortionings(db, {}))[0].status, 'anulada');
});

test('32. se cuenta una sola vez: paquetes + porciones + suelto, y la hoja muestra cómo se contó', async () => {
  const { db, admin, cook } = await setup();
  const p = await pechuga(db, admin);
  const c = await counts.submitCount(db, cook, {
    location: 'Congelador',
    kind: 'apertura',
    lines: [{ item_id: p.id, packs: 1, portions: [12, 3], loose: 140 }],
  });
  const line = (await counts.getCount(db, admin, c.id)).lines![0];
  assert.equal(line.counted_m, 2_000_000 + 12 * 80_000 + 3 * 300_000 + 140_000);
  assert.equal(detailText(line.detail!, 'g'), '1 bolsa + 12 porción picada + 3 porción asado + 140 g');
  const sheet = (await counts.inventorySheet(db, admin, c.local_date)).sections[0].lines[0];
  assert.equal(sheet.open_m, line.counted_m);
  assert.equal(sheet.open_detail?.packs, 1);
  // La forma anterior (cantidad total) sigue funcionando.
  const old = await counts.submitCount(db, cook, { location: 'Congelador', lines: [{ item_id: p.id, qty: 3, unit: 'kg' }] });
  assert.equal((await counts.getCount(db, admin, old.id)).lines![0].detail, null);
});

test('33. la merma de porcionar no aparece como diferencia en «caja vs cocina»', async () => {
  const { db, admin, cook } = await setup();
  const p = await pechuga(db, admin);
  const day = '2026-10-14';
  const at = (h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00-05:00`).toISOString();
  const open = await counts.submitCount(db, admin, { location: 'Congelador', kind: 'apertura', lines: [{ item_id: p.id, qty: 5, unit: 'kg' }] }, { at: at(8) });
  assert.equal(open.status, 'aplicado');
  await portioning.registerPortioning(db, cook, { item_id: p.id, portions: [10, 0], merma: 200 }, { at: at(10) });
  await counts.submitCount(db, admin, { location: 'Congelador', kind: 'cierre', lines: [{ item_id: p.id, qty: 4.8, unit: 'kg' }] }, { at: at(23) });
  const line = (await counts.reconciliation(db, day)).lines[0];
  assert.equal(line.trim_m, 200_000);
  assert.equal(line.real_m, 0);
  assert.equal(line.diff_m, 0);
});

test('34. recibir pedido: se escribe en paquetes, entra todo junto y cierra los faltantes', async () => {
  const { db, admin, cook } = await setup();
  const butifarra = await inv.createItem(db, admin, { name: 'Butifarra', category: 'Carnes y embutidos', unit: 'unidad', qty: 0, min: 10, location: 'Congelador', pack_size: 20, pack_label: 'paquete' });
  const queso = await inv.createItem(db, admin, { name: 'Queso', category: 'Lácteos', unit: 'g', qty: 0, min: 1000, location: 'Nevera Coca-Cola', pack_size: 2500, pack_label: 'bloque' });
  const sal = await inv.createItem(db, admin, { name: 'Sal', category: 'Abarrotes', unit: 'g', qty: 0, min: 0, location: 'Bodega seca' });
  await shortages.reportShortage(db, cook, { item_id: butifarra.id, level: 'agotado' });
  const r = await inv.registerEntries(db, admin, {
    lines: [
      { item_id: butifarra.id, packs: 3 },
      { item_id: queso.id, packs: 2, qty: 300, unit: 'g' },
      { item_id: sal.id, qty: 1, unit: 'kg' },
    ],
  });
  assert.equal(r.count, 3);
  assert.equal(await qty(db, butifarra.id), 60_000); // 3 paquetes × 20
  assert.equal(await qty(db, queso.id), 5_300_000);
  assert.equal(await qty(db, sal.id), 1_000_000);
  assert.equal((await shortages.listShortages(db, { scope: 'open' })).length, 0);
  // Todo o nada: si una línea está mal, no entra ninguna.
  await assert.rejects(async () => await inv.registerEntries(db, admin, { lines: [{ item_id: queso.id, packs: 1 }, { item_id: sal.id, packs: 1 }] }), /no tiene configurado/);
  assert.equal(await qty(db, queso.id), 5_300_000);
});

test('35. el queso se maneja en gramos: bloques cerrados y lo que lleva consumido el abierto', () => {
  assert.deepEqual(openPack(7_120_000, 2_500_000), { closed: 2, openM: 2_120_000, consumedM: 380_000 });
  assert.deepEqual(openPack(5_000_000, 2_500_000), { closed: 2, openM: 0, consumedM: 0 });
  assert.equal(openPack(100, 0), null);
});

test('36. catálogo: carnes frías por unidad, carnes porcionadas crudas y día de recetas', async () => {
  const { db, admin, cashier } = await setup();
  await kitchen.loadCatalog(db, admin);
  const items = await inv.listItems(db);
  const by = (name: string) => items.find((i) => i.name === name)!;
  for (const n of ['Butifarra', 'Chorizo parrillada', 'Salchicha manguera']) assert.equal(by(n).base_unit, 'unidad', n);
  assert.equal(by('Queso mozzarella').base_unit, 'g');
  assert.equal(by('Queso mozzarella').pack_label, 'bloque');
  assert.ok(by('Pechuga cruda').portions.length >= 2);
  assert.ok(!items.some((i) => i.name === 'Pechuga a la plancha'));
  const names = (await preps.listPreparations(db)).map((p) => p.name);
  for (const n of ['Carne molida preparada', 'Adobo para carnes', 'Salsa de piña', 'Piña en trocitos']) assert.ok(names.includes(n), n);

  // La salchipapa para 2 lleva 2 salchichas; la picada «de 40» 2 chorizos y 2 butifarras.
  const products = await prod.listProducts(db);
  const line = (product: string, item: string) => products.find((p) => p.name === product)!.recipe.find((r) => r.item_name === item)!.qty_m;
  assert.equal(line('Salchipapa tradicional para 2', 'Salchicha manguera'), 2000);
  assert.equal(line('Salchipapa tradicional para 1', 'Salchicha manguera'), 1000);
  assert.equal(line('Picadita mix para 2', 'Butifarra'), 2000);
  assert.equal(line('Picadita mix para 2', 'Chorizo parrillada'), 1000);
  assert.equal(line('Picadita mix para 4', 'Chorizo parrillada'), 2000);
  assert.equal(line('Picadita mix para 4', 'Butifarra'), 2000);

  // Vender descuenta unidades enteras.
  const butifarra = by('Butifarra');
  await inv.registerEntries(db, admin, { lines: [{ item_id: butifarra.id, packs: 1 }, ...['Chorizo parrillada', 'Pechuga cruda', 'Papas a la francesa', 'Queso mozzarella', 'Lechuga crespa'].map((n) => ({ item_id: by(n).id, qty: 5000, unit: by(n).base_unit === 'unidad' ? 'unidad' : by(n).base_unit }))] });
  await inv.registerEntry(db, admin, by('Salsa de la casa').id, { qty: 1000, unit: 'ml' });
  const picada = products.find((p) => p.name === 'Picadita mix para 2')!;
  await sales.registerSale(db, cashier, { requestId: 'picada-0001', items: [{ productId: picada.id, qty: 1 }] });
  assert.equal(await qty(db, butifarra.id), 18_000);
});
