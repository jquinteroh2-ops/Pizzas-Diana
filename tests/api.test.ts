// Pruebas de la API HTTP: autenticación y permisos validados en el servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDb } from '../server/db.ts';
import { createApp } from '../server/app.ts';

let server: Server;
let base = '';

before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** Cliente mínimo que guarda la cookie de sesión. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

test('12. permisos: la caja no puede ejecutar acciones de administrador', async () => {
  const admin = client();
  const anon = client();

  assert.equal((await anon('GET', '/api/items')).status, 401);
  assert.equal((await anon('GET', '/api/session')).body.needsSetup, true);

  const setup = await admin('POST', '/api/setup', { username: 'diana', name: 'Diana', password: 'clave-admin-123' });
  assert.equal(setup.status, 200);
  // Una vez configurado, nadie más puede usar /setup para crearse un administrador.
  assert.equal((await anon('POST', '/api/setup', { username: 'intruso', name: 'X', password: 'clave-admin-123' })).status, 403);

  const item = await admin('POST', '/api/items', { name: 'Gaseosa', category: 'Bebidas', unit: 'unidad', qty: 10, min: 2 });
  assert.equal(item.status, 200);
  const product = await admin('POST', '/api/products', {
    name: 'Gaseosa',
    category: 'Bebidas',
    type: 'directo',
    recipe: [{ item_id: item.body.id, qty: 1, unit: 'unidad' }],
  });
  assert.equal(product.status, 200);
  const created = await admin('POST', '/api/users', { username: 'pedro', name: 'Pedro', role: 'caja', password: 'clave-emple-123' });
  assert.equal(created.status, 200);

  const emp = client();
  assert.equal((await emp('POST', '/api/login', { username: 'pedro', password: 'mala-clave' })).status, 401);
  assert.equal((await emp('POST', '/api/login', { username: 'pedro', password: 'clave-emple-123' })).status, 200);

  // Puede ver productos activos y registrar ventas.
  assert.equal((await emp('GET', '/api/products')).status, 200);
  const sale = await emp('POST', '/api/sales', { requestId: 'req-emp-0001', items: [{ productId: product.body.id, qty: 2 }] });
  assert.equal(sale.status, 201);
  const dup = await emp('POST', '/api/sales', { requestId: 'req-emp-0001', items: [{ productId: product.body.id, qty: 2 }] });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.duplicate, true);

  // No puede: inventario, ajustes, recetas, usuarios, anular, reportes, demo.
  const forbidden: [string, string, unknown?][] = [
    ['GET', '/api/items'],
    ['POST', '/api/items', { name: 'X', category: 'Otros', unit: 'unidad', qty: 1, min: 0 }],
    ['POST', `/api/items/${item.body.id}/adjust`, { mode: 'set', value: 100, reason: 'robo' }],
    ['POST', `/api/items/${item.body.id}/entry`, { qty: 100 }],
    ['PUT', `/api/products/${product.body.id}`, { name: 'Hack' }],
    ['POST', '/api/users', { username: 'otro', name: 'Otro', role: 'admin', password: '12345678' }],
    ['POST', `/api/sales/${sale.body.sale.id}/annul`, { reason: 'quiero' }],
    ['GET', '/api/dashboard'],
    ['GET', '/api/reports?period=dia'],
    ['POST', '/api/settings/demo/load', {}],
  ];
  for (const [m, p, b] of forbidden) {
    assert.equal((await emp(m, p, b)).status, 403, `${m} ${p} debería estar prohibido`);
  }

  // El inventario no cambió por los intentos del empleado (solo la venta: 10 - 2).
  const items = await admin('GET', '/api/items');
  assert.equal(items.body[0].qty_m, 8000);

  // Solo ve sus propias ventas.
  await admin('POST', '/api/sales', { requestId: 'req-admin-0001', items: [{ productId: product.body.id, qty: 1 }] });
  assert.equal((await emp('GET', '/api/sales')).body.length, 1);
  assert.equal((await admin('GET', '/api/sales')).body.length, 2);

  // Si el administrador le concede "entradas", ya puede registrar entradas pero no ajustes.
  await admin('PUT', `/api/users/${created.body.id}`, { perms: ['entradas'] });
  assert.equal((await emp('POST', `/api/items/${item.body.id}/entry`, { qty: 5, reason: 'Llegó pedido' })).status, 200);
  assert.equal((await emp('POST', `/api/items/${item.body.id}/adjust`, { mode: 'set', value: 100, reason: 'robo' })).status, 403);

  // El administrador sí puede anular.
  assert.equal((await admin('POST', `/api/sales/${sale.body.sale.id}/annul`, { reason: 'Prueba' })).status, 200);

  // Desactivar al empleado cierra su sesión.
  await admin('PUT', `/api/users/${created.body.id}`, { active: false });
  assert.equal((await emp('GET', '/api/products')).status, 401);
});

test('22. permisos por rol: la cocina prepara y reporta; no vende ni ve estadísticas. La caja no autoriza bajas', async () => {
  const admin = client();
  // El administrador ya existe (lo creó la prueba anterior).
  assert.equal((await admin('POST', '/api/login', { username: 'diana', password: 'clave-admin-123' })).status, 200);
  const cebolla = await admin('POST', '/api/items', { name: 'Cebolla', category: 'Verduras y frutas', unit: 'kg', qty: 5, min: 1, location: 'Nevera Coca-Cola' });
  const caram = await admin('POST', '/api/items', { name: 'Cebolla caramelizada', category: 'Verduras y frutas', unit: 'g', qty: 0, min: 300, location: 'Nevera negra' });
  const prep = await admin('POST', '/api/preparations', {
    name: 'Cebolla caramelizada',
    mode: 'transformacion',
    output_item_id: caram.body.id,
    std_output: 450,
    std_output_unit: 'g',
    inputs: [{ item_id: cebolla.body.id, qty: 1000, unit: 'g' }],
  });
  assert.equal(prep.status, 200);
  await admin('POST', '/api/users', { username: 'carlos', name: 'Carlos', role: 'cocina', password: 'clave-cocina-1' });
  await admin('POST', '/api/users', { username: 'laura', name: 'Laura', role: 'caja', password: 'clave-caja-123' });
  const cook = client();
  const cash = client();
  assert.equal((await cook('POST', '/api/login', { username: 'carlos', password: 'clave-cocina-1' })).status, 200);
  assert.equal((await cash('POST', '/api/login', { username: 'laura', password: 'clave-caja-123' })).status, 200);

  // La cocina sí puede: ver inventario, preparar, contar, reportar faltantes y bajas.
  assert.equal((await cook('GET', '/api/items')).status, 200);
  assert.equal((await cook('GET', '/api/kitchen/today')).status, 200);
  const made = await cook('POST', '/api/productions', { preparation_id: prep.body.id, input_qty: 1, input_unit: 'kg', output_qty: 450, output_unit: 'g' });
  assert.equal(made.status, 201);
  assert.equal(made.body.efficiency_pct, 100);
  assert.equal((await cook('POST', '/api/shortages', { item_id: cebolla.body.id, level: 'poco' })).status, 201);
  const waste = await cook('POST', '/api/wastes', { item_id: cebolla.body.id, qty: 100, unit: 'g', reason: 'danado' });
  assert.equal(waste.status, 201);
  assert.equal((await cook('GET', `/api/counts/sheet?location=${encodeURIComponent('Nevera negra')}`)).body.lines.length, 1);

  // La cocina no puede: vender, ver estadísticas, autorizar, administrar preparaciones ni la lista de compras.
  const cookForbidden: [string, string, unknown?][] = [
    ['POST', '/api/sales', { requestId: 'cocina-0001', items: [] }],
    ['GET', '/api/dashboard'],
    ['GET', '/api/reports/kitchen?period=semana'],
    ['POST', `/api/wastes/${waste.body.id}/review`, { decision: 'aprobar' }],
    ['POST', '/api/preparations', { name: 'X' }],
    ['GET', '/api/shopping-list'],
    ['POST', `/api/productions/${made.body.id}/annul`, { reason: 'quiero' }],
    ['POST', `/api/items/${cebolla.body.id}/adjust`, { mode: 'set', value: 100, reason: 'robo' }],
  ];
  for (const [m, p, b] of cookForbidden) assert.equal((await cook(m, p, b)).status, 403, `cocina: ${m} ${p} debería estar prohibido`);

  // La caja reporta faltantes y bajas, pero no prepara ni autoriza.
  assert.equal((await cash('POST', '/api/shortages', { item_id: caram.body.id, level: 'agotado' })).status, 201);
  for (const [m, p, b] of [
    ['POST', '/api/productions', { preparation_id: prep.body.id }],
    ['POST', `/api/wastes/${waste.body.id}/review`, { decision: 'aprobar' }],
    ['GET', '/api/counts/sheet?location=Congelador'],
  ] as [string, string, unknown?][]) {
    assert.equal((await cash(m, p, b)).status, 403, `caja: ${m} ${p} debería estar prohibido`);
  }

  // El administrador autoriza la baja y ve la lista de compras.
  assert.equal((await admin('POST', `/api/wastes/${waste.body.id}/review`, { decision: 'aprobar' })).status, 200);
  const list = await admin('GET', '/api/shopping-list');
  assert.deepEqual(
    list.body.map((l: { name: string }) => l.name).sort(),
    ['Cebolla', 'Cebolla caramelizada'],
  );
  // Una foto pesada pero válida cabe en la petición (límite de 2 MB).
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(900_000);
  assert.equal((await cook('POST', '/api/wastes', { item_id: cebolla.body.id, qty: 50, unit: 'g', reason: 'vencido', photo })).status, 201);
});

test('peticiones que no son JSON se rechazan (protección CSRF)', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(res.status, 415);
});
