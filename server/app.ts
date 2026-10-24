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
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = fn(req, res);
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
  app.get('/api/session', h((req) => {
    const user = users.userFromToken(db, readCookie(req, COOKIE));
    return {
      user,
      needsSetup: users.needsSetup(db),
      demoMode: getSetting(db, 'demo_mode') === '1',
      today: localDate(),
    };
  }));

  app.post('/api/setup', h((req, res) => {
    throttle(req);
    const user = users.setupAdmin(db, req.body ?? {});
    setCookie(res, users.createSession(db, user.id));
    return { user };
  }));

  app.post('/api/login', h((req, res) => {
    throttle(req);
    const user = users.authenticate(db, req.body?.username, req.body?.password);
    attempts.delete(req.ip ?? 'x');
    setCookie(res, users.createSession(db, user.id));
    return { user };
  }));

  app.post('/api/logout', h((req, res) => {
    users.destroySession(db, readCookie(req, COOKIE));
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }));

  // A partir de aquí todo requiere sesión.
  app.use('/api', (req, _res, next) => {
    const user = users.userFromToken(db, readCookie(req, COOKIE));
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

  app.post('/api/me/password', h((req) => users.changeOwnPassword(db, req.user!, req.body?.current, req.body?.next)));

  // ---------- Inventario ----------
  app.get('/api/items', need('inventory.view'), h(() => inv.listItems(db)));
  app.get('/api/items/:id', need('inventory.view'), h((req) => inv.getItem(db, id(req))));
  app.post('/api/items', need('inventory.edit'), h((req) => inv.createItem(db, req.user!, req.body ?? {})));
  app.put('/api/items/:id', need('inventory.edit'), h((req) => inv.updateItem(db, id(req), req.body ?? {})));
  app.post('/api/items/:id/active', need('inventory.edit'), h((req) => inv.setItemActive(db, id(req), req.body?.active === true)));
  app.post('/api/items/:id/entry', need('inventory.entry'), h((req) => inv.registerEntry(db, req.user!, id(req), req.body ?? {})));
  // Recibir un pedido: varias entradas a la vez, contadas en paquetes como llegaron.
  app.post('/api/entries', need('inventory.entry'), h((req, res) => {
    res.status(201).json(inv.registerEntries(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/items/:id/adjust', need('inventory.adjust'), h((req) => inv.registerAdjustment(db, req.user!, id(req), req.body ?? {})));
  app.get('/api/movements', need('inventory.view'), h((req) =>
    inv.listMovements(db, { itemId: qNum(req.query.itemId), type: qStr(req.query.type), limit: qNum(req.query.limit) }),
  ));

  // ---------- Productos ----------
  // Cualquier usuario puede consultar productos (para registrar ventas).
  app.get('/api/products', h((req) => {
    const list = prod.listProducts(db);
    return users.can(req.user!, 'products.edit') ? list : list.filter((p) => p.active);
  }));
  app.post('/api/products', need('products.edit'), h((req) => prod.createProduct(db, req.body ?? {})));
  app.put('/api/products/:id', need('products.edit'), h((req) => prod.updateProduct(db, id(req), req.body ?? {})));
  app.post('/api/products/:id/active', need('products.edit'), h((req) => prod.setProductActive(db, id(req), req.body?.active === true)));

  // ---------- Ventas ----------
  app.post('/api/sales/preview', need('sales.create'), h((req) => sales.previewSale(db, req.body ?? {})));
  app.post('/api/sales', need('sales.create'), h((req, res) => {
    const out = sales.registerSale(db, req.user!, req.body ?? {});
    res.status(out.duplicate ? 200 : 201).json(out);
  }));
  app.get('/api/sales', h((req) =>
    sales.listSales(db, req.user!, {
      from: qStr(req.query.from),
      to: qStr(req.query.to),
      productId: qNum(req.query.productId),
      userId: qNum(req.query.userId),
      status: qStr(req.query.status),
      limit: qNum(req.query.limit),
    }),
  ));
  app.get('/api/sales/:id', h((req) => sales.getSale(db, req.user!, String(req.params.id))));
  app.post('/api/sales/:id/annul', need('sales.annul'), h((req) => sales.annulSale(db, req.user!, String(req.params.id), req.body ?? {})));

  // ---------- Reportes ----------
  app.get('/api/dashboard', need('reports.view'), h(() => reports.dashboard(db)));
  app.get('/api/charts', need('reports.view'), h((req) => {
    const series = reports.chartRange(qStr(req.query.series) ?? '7d');
    const top = reports.chartRange(qStr(req.query.top) ?? 'semana');
    return { series: { range: series, data: reports.dailySeries(db, series) }, top: { range: top, data: reports.byProduct(db, top) } };
  }));
  app.get('/api/reports', need('reports.view'), h((req) =>
    reports.periodReport(db, qStr(req.query.period) ?? 'dia', qStr(req.query.date) ?? localDate()),
  ));

  app.get('/api/reports/kitchen', need('reports.view'), h((req) =>
    reports.kitchenReport(db, qStr(req.query.period) ?? 'semana', qStr(req.query.date) ?? localDate()),
  ));

  // ---------- Cocina ----------
  app.get('/api/kitchen/today', need('kitchen.report'), h((req) => kitchen.kitchenToday(db, req.user!)));
  // Para reportar faltantes y bajas hace falta la lista de productos (también la caja, que no ve el inventario).
  app.get('/api/kitchen/items', need('kitchen.report'), h(() => inv.listItems(db).filter((i) => i.active)));

  // Preparaciones (recetas de la cocina) y lo que se prepara cada día.
  app.get('/api/preparations', need('kitchen.use'), h(() => preps.listPreparations(db)));
  app.post('/api/preparations', need('kitchen.manage'), h((req) => preps.createPreparation(db, req.body ?? {})));
  app.put('/api/preparations/:id', need('kitchen.manage'), h((req) => preps.updatePreparation(db, id(req), req.body ?? {})));
  app.post('/api/preparations/:id/active', need('kitchen.manage'), h((req) => preps.setPreparationActive(db, id(req), req.body?.active === true)));
  app.get('/api/productions', need('kitchen.use'), h((req) =>
    preps.listProductions(db, {
      from: qStr(req.query.from),
      to: qStr(req.query.to),
      preparationId: qNum(req.query.preparationId),
      // Como la hoja de papel, la cocina ve lo que preparó todo el equipo.
      userId: qNum(req.query.userId),
      limit: qNum(req.query.limit),
    }),
  ));
  app.post('/api/productions', need('kitchen.use'), h((req, res) => {
    res.status(201).json(preps.registerProduction(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/productions/:id/annul', need('kitchen.manage'), h((req) => preps.annulProduction(db, req.user!, id(req), req.body ?? {})));

  // Porcionado: partir un insumo en porciones. Solo descuenta la merma.
  app.get('/api/portionings', need('kitchen.use'), h((req) =>
    portioning.listPortionings(db, { from: qStr(req.query.from), to: qStr(req.query.to), itemId: qNum(req.query.itemId), limit: qNum(req.query.limit) }),
  ));
  app.post('/api/portionings', need('kitchen.use'), h((req, res) => {
    res.status(201).json(portioning.registerPortioning(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/portionings/:id/annul', need('kitchen.manage'), h((req) => portioning.annulPortioning(db, req.user!, id(req), req.body ?? {})));

  // Bajas: las reporta cualquiera, las autoriza el administrador.
  app.get('/api/wastes', need('kitchen.report'), h((req) =>
    wastes.listWastes(db, req.user!, { status: qStr(req.query.status), from: qStr(req.query.from), to: qStr(req.query.to), limit: qNum(req.query.limit) }),
  ));
  app.get('/api/wastes/:id/photo', need('kitchen.report'), h((req) => wastes.getWastePhoto(db, req.user!, id(req))));
  app.post('/api/wastes', need('kitchen.report'), h((req, res) => {
    res.status(201).json(wastes.reportWaste(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/wastes/:id/review', need('kitchen.manage'), h((req) => wastes.reviewWaste(db, req.user!, id(req), req.body ?? {})));

  // Faltantes y lista de compras.
  app.get('/api/shortages', need('kitchen.report'), h((req) => shortages.listShortages(db, { scope: qStr(req.query.scope), limit: qNum(req.query.limit) })));
  app.post('/api/shortages', need('kitchen.report'), h((req, res) => {
    res.status(201).json(shortages.reportShortage(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/shortages/:id/status', need('kitchen.manage'), h((req) => shortages.setShortageStatus(db, req.user!, id(req), req.body ?? {})));
  app.get('/api/shopping-list', need('kitchen.manage'), h(() => shortages.shoppingList(db)));

  // Conteos por ubicación.
  app.get('/api/counts/sheet', need('kitchen.use'), h((req) => counts.countSheet(db, qStr(req.query.location))));
  app.get('/api/sheets/inventory', need('kitchen.use'), h((req) => counts.inventorySheet(db, req.user!, qStr(req.query.date) ?? localDate())));
  app.get('/api/counts/day', need('kitchen.use'), h((req) => counts.dayCountStatus(db, qStr(req.query.date) ?? localDate())));
  // Caja vs cocina: lo que descontaron las ventas frente a lo que se gastó según apertura y cierre.
  app.get('/api/reconciliation', need('kitchen.manage'), h((req) => counts.reconciliation(db, qStr(req.query.date) ?? localDate())));
  app.get('/api/counts', need('kitchen.use'), h((req) => counts.listCounts(db, req.user!, { status: qStr(req.query.status), limit: qNum(req.query.limit) })));
  app.get('/api/counts/:id', need('kitchen.use'), h((req) => counts.getCount(db, req.user!, id(req))));
  app.post('/api/counts', need('kitchen.use'), h((req, res) => {
    res.status(201).json(counts.submitCount(db, req.user!, req.body ?? {}));
  }));
  app.post('/api/counts/:id/review', need('kitchen.manage'), h((req) => counts.reviewCount(db, req.user!, id(req), req.body ?? {})));

  // Plan de preparación semanal.
  app.get('/api/prep-plan', need('kitchen.use'), h((req) => plan.weekPlan(db, qStr(req.query.date))));
  app.post('/api/prep-plan', need('kitchen.manage'), h((req) => plan.addTask(db, req.user!, req.body ?? {})));
  app.post('/api/prep-plan/copy-previous', need('kitchen.manage'), h((req) => plan.copyPreviousWeek(db, req.user!, req.body?.date)));
  app.post('/api/prep-plan/:id/delete', need('kitchen.manage'), h((req) => plan.deleteTask(db, id(req))));

  // ---------- Usuarios ----------
  app.get('/api/users', h((req) => {
    // Los empleados con historial completo necesitan la lista de nombres para filtrar.
    if (!users.can(req.user!, 'users.manage') && !users.can(req.user!, 'sales.viewAll')) throw new AppError(403, 'No tienes permiso.');
    const list = users.listUsers(db);
    return users.can(req.user!, 'users.manage') ? list : list.map((u) => ({ id: u.id, name: u.name }));
  }));
  app.post('/api/users', need('users.manage'), h((req) => users.createUser(db, req.body ?? {})));
  app.put('/api/users/:id', need('users.manage'), h((req) => users.updateUser(db, req.user!, id(req), req.body ?? {})));
  app.post('/api/users/:id/password', need('users.manage'), h((req) => users.resetPassword(db, id(req), req.body?.password)));

  // ---------- Configuración y demostración ----------
  app.get('/api/settings/demo', need('settings.manage'), h(() => demo.demoStatus(db)));
  app.post('/api/settings/demo/load', need('settings.manage'), h((req) => demo.loadDemo(db, req.user!)));
  app.post('/api/settings/demo/reset', need('settings.manage'), h((req) => demo.resetDemo(db, req.user!)));
  app.post('/api/settings/demo/clear', need('settings.manage'), h(() => demo.clearDemo(db)));
  app.post('/api/settings/catalog', need('settings.manage'), h((req) => kitchen.loadCatalog(db, req.user!)));

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
