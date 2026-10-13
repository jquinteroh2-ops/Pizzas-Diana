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

test('12. permisos: el empleado no puede ejecutar acciones de administrador', async () => {
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
  const created = await admin('POST', '/api/users', { username: 'pedro', name: 'Pedro', role: 'empleado', password: 'clave-emple-123' });
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

test('peticiones que no son JSON se rechazan (protección CSRF)', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(res.status, 415);
});
