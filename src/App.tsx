import { useCallback, useEffect, useState } from 'react';
import { api, onUnauthorized } from './lib/api';
import { AppProvider, navigate, useApp, useHashRoute, type RouteName } from './lib/app';
import type { Session } from './lib/types';
import { Layout, allowedNav } from './components/Layout';
import { Loading, ErrorBox } from './components/ui';
import { PizzaMark } from './components/Logo';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Products from './pages/Products';
import NewSale from './pages/NewSale';
import History from './pages/History';
import Reports from './pages/Reports';
import UsersPage from './pages/Users';
import SettingsPage from './pages/Settings';
import Kitchen from './pages/Kitchen';
import PrepPlan from './pages/PrepPlan';
import TopSellers from './pages/TopSellers';

const PAGES: Record<RouteName, () => React.JSX.Element> = {
  inicio: Dashboard,
  'mas-vendidos': TopSellers,
  cocina: Kitchen,
  plan: PrepPlan,
  inventario: Inventory,
  productos: Products,
  vender: NewSale,
  historial: History,
  reportes: Reports,
  usuarios: UsersPage,
  configuracion: SettingsPage,
};

function Routed() {
  const route = useHashRoute();
  const { can } = useApp();
  const allowed = allowedNav(can);
  const ok = allowed.some((n) => n.name === route.name);

  // Si la ruta no existe o no hay permiso, ir a la primera sección permitida.
  useEffect(() => {
    if (!ok && allowed[0]) navigate(allowed[0].name);
  }, [ok, allowed]);

  if (!ok) return <Loading />;
  const Page = PAGES[route.name];
  return (
    <Layout current={route.name}>
      <div key={route.name} className="animate-fade-in">
        <Page />
      </div>
    </Layout>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadSession = useCallback(async () => {
    try {
      setSession(await api.get<Session>('/session'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    }
  }, []);

  useEffect(() => {
    void reloadSession();
    return onUnauthorized(() => {
      void reloadSession();
    });
  }, [reloadSession]);

  if (error && !session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorBox message={error} onRetry={reloadSession} />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <PizzaMark className="size-14 animate-pulse" />
          <Loading text="Preparando el horno…" />
        </div>
      </div>
    );
  }
  if (!session.user) return <Login session={session} onDone={reloadSession} />;

  return (
    <AppProvider session={session} reloadSession={reloadSession}>
      <Routed />
    </AppProvider>
  );
}
