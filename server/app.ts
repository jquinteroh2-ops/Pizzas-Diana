import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { getSetting } from './db.ts';
import { AppError } from './errors.ts';
import * as users from './services/users.ts';
import * as inv from './services/inventory.ts';
import * as prod from './services/products.ts';
import * as sales from './services/sales.ts';
import * as reports from './services/reports.ts';
import * as demo from './services/demo.ts';
import * as preps from './services/preparations.ts';
import * as wastes from './services/wastes.ts';
import * as shortages from './services/shortages.ts';
import * as counts from './services/counts.ts';
import * as plan from './services/plan.ts';
import * as kitchen from './services/kitchen.ts';
import * as portioning from './services/portioning.ts';
import { localDate } from '../shared/dates.ts';

const COOKIE = 'pd_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: users.User;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

type Handler = (req: Request, res: Response) => unknown;

/** Envuelve un manejador: responde JSON y convierte errores de negocio en códigos HTTP. */
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (err) {
    next(err);
  }
};

const qNum = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
const qStr = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

export function createApp(db: DB, opts: { secureCookies?: boolean; staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // 2 MB alcanza para la foto comprimida de una baja.
  app.use(express.json({ limit: '2mb' }));

  // Cabeceras básicas de seguridad.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Las peticiones que cambian datos deben ser JSON: un formulario de otro sitio no puede enviarlas (CSRF).
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && !req.is('application/json')) return next(new AppError(415, 'Se esperaba JSON.'));
    next();
  });

  const setCookie = (res: Response, token: string) =>
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: !!opts.secureCookies, maxAge: 12 * 3600_000, path: '/' });

  // Límite sencillo de intentos de inicio de sesión por IP.
  const attempts = new Map<string, { n: number; until: number }>();
  const throttle = (req: Request) => {
    const key = req.ip ?? 'x';
    const a = attempts.get(key);
    if (a && a.until > Date.now() && a.n >= 8) throw new AppError(429, 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
    if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 60_000 });
    else a.n++;
  };

  // ---------- Sesión ----------
  app.get('/api/session', h(async (req) => {
    const user = await users.userFromToken(db, readCookie(req, COOKIE));
    return {
      user,
      needsSetup: await users.needsSetup(db),
      demoMode: await getSetting(db, 'demo_mode') === '1',
      today: localDate(),
    };
  }));

  app.post('/api/setup', h(async (req, res) => {
    throttle(req);
    const user = await users.setupAdmin(db, req.body ?? {});
    setCookie(res, await users.createSession(db, user.id));
    return { user };
  }));

  app.post('/api/login', h(async (req, res) => {
    throttle(req);
    const user = await users.authenticate(db, req.body?.username, req.body?.password);
    attempts.delete(req.ip ?? 'x');
    setCookie(res, await users.createSession(db, user.id));
    return { user };
  }));

  app.post('/api/logout', h(async (req, res) => {
    await users.destroySession(db, readCookie(req, COOKIE));
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }));

  // A partir de aquí todo requiere sesión.
  app.use('/api', async (req, _res, next) => {
    const user = await users.userFromToken(db, readCookie(req, COOKIE));
    if (!user) return next(new AppError(401, 'Tu sesión terminó. Inicia sesión de nuevo.'));
    req.user = user;
    next();
  });

  const need = (action: users.Action) => (req: Request, _res: Response, next: NextFunction) => {
    if (!users.can(req.user!, action)) return next(new AppError(403, 'No tienes permiso para realizar esta acción.'));
    next();
  };
  const id = (req: Request) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new AppError(400, 'Identificador no válido.');
    return n;
  };

  app.post('/api/me/password', h(async (req) => await users.changeOwnPassword(db, req.user!, req.body?.current, req.body?.next)));

  // ---------- Inventario ----------
  app.get('/api/items', need('inventory.view'), h(async () => await inv.listItems(db)));
  app.get('/api/items/:id', need('inventory.view'), h(async (req) => await inv.getItem(db, id(req))));
  app.post('/api/items', need('inventory.edit'), h(async (req) => await inv.createItem(db, req.user!, req.body ?? {})));
  app.put('/api/items/:id', need('inventory.edit'), h(async (req) => await inv.updateItem(db, id(req), req.body ?? {})));
  app.post('/api/items/:id/active', need('inventory.edit'), h(async (req) => await inv.setItemActive(db, id(req), req.body?.active === true)));
  app.post('/api/items/:id/entry', need('inventory.entry'), h(async (req) => await inv.registerEntry(db, req.user!, id(req), req.body ?? {})));
  // Recibir un pedido: varias entradas a la vez, contadas en paquetes como llegaron.
  app.post('/api/entries', need('inventory.entry'), h(async (req, res) => {
    res.status(201).json(await inv.registerEntries(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/items/:id/adjust', need('inventory.adjust'), h(async (req) => await inv.registerAdjustment(db, req.user!, id(req), req.body ?? {})));
  app.get('/api/movements', need('inventory.view'), h(async (req) =>
    await inv.listMovements(db, { itemId: qNum(req.query.itemId), type: qStr(req.query.type), limit: qNum(req.query.limit) }),
  ));

  // ---------- Productos ----------
  // Cualquier usuario puede consultar productos (para registrar ventas).
  app.get('/api/products', h(async (req) => {
    const list = await prod.listProducts(db);
    return users.can(req.user!, 'products.edit') ? list : list.filter((p) => p.active);
  }));
  app.post('/api/products', need('products.edit'), h(async (req) => await prod.createProduct(db, req.body ?? {})));
  app.put('/api/products/:id', need('products.edit'), h(async (req) => await prod.updateProduct(db, id(req), req.body ?? {})));
  app.post('/api/products/:id/active', need('products.edit'), h(async (req) => await prod.setProductActive(db, id(req), req.body?.active === true)));

  // ---------- Ventas ----------
  app.post('/api/sales/preview', need('sales.create'), h(async (req) => await sales.previewSale(db, req.body ?? {})));
  app.post('/api/sales', need('sales.create'), h(async (req, res) => {
    const out = await sales.registerSale(db, req.user!, req.body ?? {});
    res.status(out.duplicate ? 200 : 201).json(out);
  }));
  app.get('/api/sales', h(async (req) =>
    await sales.listSales(db, req.user!, {
      from: qStr(req.query.from),
      to: qStr(req.query.to),
      productId: qNum(req.query.productId),
      userId: qNum(req.query.userId),
      status: qStr(req.query.status),
      limit: qNum(req.query.limit),
    }),
  ));
  app.get('/api/sales/:id', h(async (req) => await sales.getSale(db, req.user!, String(req.params.id))));
  app.post('/api/sales/:id/annul', need('sales.annul'), h(async (req) => await sales.annulSale(db, req.user!, String(req.params.id), req.body ?? {})));

  // ---------- Reportes ----------
  app.get('/api/dashboard', need('reports.view'), h(async () => await reports.dashboard(db)));
  app.get('/api/charts', need('reports.view'), h(async (req) => {
    const series = reports.chartRange(qStr(req.query.series) ?? '7d');
    const top = reports.chartRange(qStr(req.query.top) ?? 'semana');
    return { series: { range: series, data: await reports.dailySeries(db, series) }, top: { range: top, data: await reports.byProduct(db, top) } };
  }));
  app.get('/api/reports', need('reports.view'), h(async (req) =>
    await reports.periodReport(db, qStr(req.query.period) ?? 'dia', qStr(req.query.date) ?? localDate()),
  ));

  app.get('/api/reports/kitchen', need('reports.view'), h(async (req) =>
    await reports.kitchenReport(db, qStr(req.query.period) ?? 'semana', qStr(req.query.date) ?? localDate()),
  ));

  // ---------- Cocina ----------
  app.get('/api/kitchen/today', need('kitchen.report'), h(async (req) => await kitchen.kitchenToday(db, req.user!)));
  // Para reportar faltantes y bajas hace falta la lista de productos (también la caja, que no ve el inventario).
  app.get('/api/kitchen/items', need('kitchen.report'), h(async () => (await inv.listItems(db)).filter((i) => i.active)));

  // Preparaciones (recetas de la cocina) y lo que se prepara cada día.
  app.get('/api/preparations', need('kitchen.use'), h(async () => await preps.listPreparations(db)));
  app.post('/api/preparations', need('kitchen.manage'), h(async (req) => await preps.createPreparation(db, req.body ?? {})));
  app.put('/api/preparations/:id', need('kitchen.manage'), h(async (req) => await preps.updatePreparation(db, id(req), req.body ?? {})));
  app.post('/api/preparations/:id/active', need('kitchen.manage'), h(async (req) => await preps.setPreparationActive(db, id(req), req.body?.active === true)));
  app.get('/api/productions', need('kitchen.use'), h(async (req) =>
    await preps.listProductions(db, {
      from: qStr(req.query.from),
      to: qStr(req.query.to),
      preparationId: qNum(req.query.preparationId),
      // Como la hoja de papel, la cocina ve lo que preparó todo el equipo.
      userId: qNum(req.query.userId),
      limit: qNum(req.query.limit),
    }),
  ));
  app.post('/api/productions', need('kitchen.use'), h(async (req, res) => {
    res.status(201).json(await preps.registerProduction(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/productions/:id/annul', need('kitchen.manage'), h(async (req) => await preps.annulProduction(db, req.user!, id(req), req.body ?? {})));

  // Porcionado: partir un insumo en porciones. Solo descuenta la merma.
  app.get('/api/portionings', need('kitchen.use'), h(async (req) =>
    await portioning.listPortionings(db, { from: qStr(req.query.from), to: qStr(req.query.to), itemId: qNum(req.query.itemId), limit: qNum(req.query.limit) }),
  ));
  app.post('/api/portionings', need('kitchen.use'), h(async (req, res) => {
    res.status(201).json(await portioning.registerPortioning(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/portionings/:id/annul', need('kitchen.manage'), h(async (req) => await portioning.annulPortioning(db, req.user!, id(req), req.body ?? {})));

  // Bajas: las reporta cualquiera, las autoriza el administrador.
  app.get('/api/wastes', need('kitchen.report'), h(async (req) =>
    await wastes.listWastes(db, req.user!, { status: qStr(req.query.status), from: qStr(req.query.from), to: qStr(req.query.to), limit: qNum(req.query.limit) }),
  ));
  app.get('/api/wastes/:id/photo', need('kitchen.report'), h(async (req) => await wastes.getWastePhoto(db, req.user!, id(req))));
  app.post('/api/wastes', need('kitchen.report'), h(async (req, res) => {
    res.status(201).json(await wastes.reportWaste(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/wastes/:id/review', need('kitchen.manage'), h(async (req) => await wastes.reviewWaste(db, req.user!, id(req), req.body ?? {})));

  // Faltantes y lista de compras.
  app.get('/api/shortages', need('kitchen.report'), h(async (req) => await shortages.listShortages(db, { scope: qStr(req.query.scope), limit: qNum(req.query.limit) })));
  app.post('/api/shortages', need('kitchen.report'), h(async (req, res) => {
    res.status(201).json(await shortages.reportShortage(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/shortages/:id/status', need('kitchen.manage'), h(async (req) => await shortages.setShortageStatus(db, req.user!, id(req), req.body ?? {})));
  app.get('/api/shopping-list', need('kitchen.manage'), h(async () => await shortages.shoppingList(db)));

  // Conteos por ubicación.
  app.get('/api/counts/sheet', need('kitchen.use'), h(async (req) => await counts.countSheet(db, qStr(req.query.location))));
  app.get('/api/sheets/inventory', need('kitchen.use'), h(async (req) => await counts.inventorySheet(db, req.user!, qStr(req.query.date) ?? localDate())));
  app.get('/api/counts/day', need('kitchen.use'), h(async (req) => await counts.dayCountStatus(db, qStr(req.query.date) ?? localDate())));
  // Caja vs cocina: lo que descontaron las ventas frente a lo que se gastó según apertura y cierre.
  app.get('/api/reconciliation', need('kitchen.manage'), h(async (req) => await counts.reconciliation(db, qStr(req.query.date) ?? localDate())));
  app.get('/api/counts', need('kitchen.use'), h(async (req) => await counts.listCounts(db, req.user!, { status: qStr(req.query.status), limit: qNum(req.query.limit) })));
  app.get('/api/counts/:id', need('kitchen.use'), h(async (req) => await counts.getCount(db, req.user!, id(req))));
  app.post('/api/counts', need('kitchen.use'), h(async (req, res) => {
    res.status(201).json(await counts.submitCount(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/counts/:id/review', need('kitchen.manage'), h(async (req) => await counts.reviewCount(db, req.user!, id(req), req.body ?? {})));

  // Plan de preparación semanal.
  app.get('/api/prep-plan', need('kitchen.use'), h(async (req) => await plan.weekPlan(db, qStr(req.query.date))));
  app.post('/api/prep-plan', need('kitchen.manage'), h(async (req) => await plan.addTask(db, req.user!, req.body ?? {})));
  app.post('/api/prep-plan/copy-previous', need('kitchen.manage'), h(async (req) => await plan.copyPreviousWeek(db, req.user!, req.body?.date)));
  app.post('/api/prep-plan/:id/delete', need('kitchen.manage'), h(async (req) => await plan.deleteTask(db, id(req))));

  // ---------- Usuarios ----------
  app.get('/api/users', h(async (req) => {
    // Los empleados con historial completo necesitan la lista de nombres para filtrar.
    if (!users.can(req.user!, 'users.manage') && !users.can(req.user!, 'sales.viewAll')) throw new AppError(403, 'No tienes permiso.');
    const list = await users.listUsers(db);
    return users.can(req.user!, 'users.manage') ? list : list.map((u) => ({ id: u.id, name: u.name }));
  }));
  app.post('/api/users', need('users.manage'), h(async (req) => await users.createUser(db, req.body ?? {})));
  app.put('/api/users/:id', need('users.manage'), h(async (req) => await users.updateUser(db, req.user!, id(req), req.body ?? {})));
  app.post('/api/users/:id/password', need('users.manage'), h(async (req) => await users.resetPassword(db, id(req), req.body?.password)));

  // ---------- Configuración y demostración ----------
  app.get('/api/settings/demo', need('settings.manage'), h(async () => await demo.demoStatus(db)));
  app.post('/api/settings/demo/load', need('settings.manage'), h(async (req) => await demo.loadDemo(db, req.user!)));
  app.post('/api/settings/demo/reset', need('settings.manage'), h(async (req) => await demo.resetDemo(db, req.user!)));
  app.post('/api/settings/demo/clear', need('settings.manage'), h(async () => await demo.clearDemo(db)));
  app.post('/api/settings/catalog', need('settings.manage'), h(async (req) => await kitchen.loadCatalog(db, req.user!)));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Ruta no encontrada.')));

  // En producción el mismo servidor entrega la aplicación compilada (dist/).
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')));
  }

  // Manejo de errores: nunca se envían detalles internos ni datos sensibles al cliente.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'La información enviada no es válida.' });
      return;
    }
    console.error('[error]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Ocurrió un error inesperado. No se guardó ningún cambio.' });
  });

  return app;
}
