import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Session, User } from './types';

export type Action =
  | 'users.manage'
  | 'settings.manage'
  | 'inventory.view'
  | 'inventory.edit'
  | 'inventory.adjust'
  | 'inventory.entry'
  | 'products.edit'
  | 'sales.create'
  | 'sales.annul'
  | 'sales.viewAll'
  | 'reports.view';

/** Misma matriz que el servidor. Solo sirve para mostrar u ocultar opciones: la seguridad real está en el backend. */
export function canDo(user: User | null, action: Action): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  switch (action) {
    case 'sales.create':
      return true;
    case 'inventory.entry':
    case 'inventory.view':
      return user.perms.includes('entradas');
    case 'reports.view':
      return user.perms.includes('reportes');
    case 'sales.viewAll':
      return user.perms.includes('historial_completo');
    default:
      return false;
  }
}

// ---------- Rutas por hash (#/inventario?item=3) ----------

export type RouteName = 'inicio' | 'inventario' | 'productos' | 'vender' | 'historial' | 'reportes' | 'usuarios' | 'configuracion';

export interface Route {
  name: RouteName;
  params: URLSearchParams;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { name: (path || 'inicio') as RouteName, params: new URLSearchParams(query ?? '') };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(name: RouteName, params?: Record<string, string | number>) {
  const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  window.location.hash = `/${name}${q}`;
}

// ---------- Contexto global ----------

interface AppCtx {
  session: Session;
  user: User;
  can: (a: Action) => boolean;
  /** Cambia cada vez que se guarda algo; las pantallas lo usan para recargar sus datos. */
  version: number;
  bump: () => void;
  reloadSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({
  session,
  reloadSession,
  children,
}: {
  session: Session;
  reloadSession: () => Promise<void>;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const logout = useCallback(async () => {
    await api.post('/logout').catch(() => undefined);
    await reloadSession();
  }, [reloadSession]);
  const value = useMemo<AppCtx>(
    () => ({ session, user: session.user!, can: (a) => canDo(session.user, a), version, bump, reloadSession, logout }),
    [session, version, bump, reloadSession, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}

/** Carga datos de la API y los vuelve a pedir cuando cambian deps o la versión global. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e.message : 'Error al cargar los datos.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, tick, ...deps]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
