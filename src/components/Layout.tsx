import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Pizza,
  ReceiptText,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  FlaskConical,
  ChefHat,
  CalendarCheck,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from './Logo';
import { cx } from './ui';
import { navigate, useApp, type Action, type RouteName } from '../lib/app';
import { ROLE_LABELS } from '../../shared/permissions.ts';

interface NavItem {
  name: RouteName;
  label: string;
  icon: LucideIcon;
  need?: Action;
}

// El orden importa: la primera sección permitida es la pantalla de inicio de cada rol
// (administrador → Inicio, caja → Registrar venta, cocina → Cocina).
export const NAV: NavItem[] = [
  { name: 'inicio', label: 'Inicio', icon: LayoutDashboard, need: 'reports.view' },
  { name: 'mas-vendidos', label: 'Más vendidos', icon: Trophy, need: 'reports.view' },
  { name: 'vender', label: 'Registrar venta', icon: ShoppingBag, need: 'sales.create' },
  { name: 'cocina', label: 'Cocina', icon: ChefHat, need: 'kitchen.report' },
  { name: 'plan', label: 'Plan de preparación', icon: CalendarCheck, need: 'kitchen.use' },
  { name: 'inventario', label: 'Inventario', icon: Package, need: 'inventory.view' },
  { name: 'productos', label: 'Productos y recetas', icon: Pizza, need: 'products.edit' },
  { name: 'historial', label: 'Historial de ventas', icon: ReceiptText, need: 'sales.create' },
  { name: 'reportes', label: 'Reportes', icon: BarChart3, need: 'reports.view' },
  { name: 'usuarios', label: 'Usuarios', icon: Users, need: 'users.manage' },
  { name: 'configuracion', label: 'Configuración', icon: Settings, need: 'settings.manage' },
];

export function allowedNav(can: (a: Action) => boolean) {
  return NAV.filter((n) => !n.need || can(n.need));
}

/** La caja usa «Cocina» solo para avisar faltantes y bajas. */
function navLabel(n: NavItem, can: (a: Action) => boolean) {
  if (n.name === 'cocina' && !can('kitchen.use')) return 'Faltantes y bajas';
  return n.label;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w)) // «Diana (Administradora)» → «DA», sin el paréntesis
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function Layout({ current, children }: { current: RouteName; children: ReactNode }) {
  const { user, can, logout, session } = useApp();
  const [open, setOpen] = useState(false);
  const items = allowedNav(can);
  // En el celular, la barra inferior muestra las 4 secciones principales de cada rol.
  const bottom = items.filter((i) => ['inicio', 'vender', 'cocina', 'plan', 'inventario', 'historial'].includes(i.name)).slice(0, 4);

  const go = (n: RouteName) => {
    setOpen(false);
    navigate(n);
  };

  const navList = (
    <nav className="flex flex-col gap-1">
      {items.map((n) => {
        const active = n.name === current;
        const Icon = n.icon;
        return (
          <button
            key={n.name}
            onClick={() => go(n.name)}
            className={cx(
              'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all',
              active ? 'bg-white/[0.09] text-white shadow-inner' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <span className={cx('grid size-8 place-items-center rounded-lg transition-colors', active ? 'bg-brand-600 text-white' : 'bg-white/[0.04] text-white/70 group-hover:text-white')}>
              <Icon className="size-[18px]" />
            </span>
            {navLabel(n, can)}
          </button>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-crust-300 text-sm font-bold text-ink-900">{initials(user.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        <p className="text-xs text-white/50">{ROLE_LABELS[user.role]}</p>
      </div>
      <button onClick={logout} className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );

  const sidebarBg = 'bg-[radial-gradient(120%_60%_at_0%_0%,#3a221a_0%,#231a16_55%)]';

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-8 p-5 lg:flex', sidebarBg)}>
        <div className="px-2 pt-2">
          <Logo light />
        </div>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        {userBox}
      </aside>

      {/* Barra superior (tablet y celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-300/60 bg-cream-100/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo compact />
        <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="size-6" />
        </button>
      </header>

      {/* Menú deslizable en celular */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className={cx('absolute inset-y-0 right-0 flex w-[82%] max-w-xs animate-fade-up flex-col gap-6 p-5', sidebarBg)}>
            <div className="flex items-center justify-between">
              <Logo light compact />
              <button className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList}</div>
            {userBox}
          </div>
        </div>
      )}

      <main className="pb-24 lg:pb-10 lg:pl-72">
        {session.demoMode && (
          <div className="flex items-center justify-center gap-2 bg-violet-700 px-4 py-2 text-center text-xs font-medium text-white">
            <FlaskConical className="size-4 shrink-0" />
            <span>
              <b>Modo demostración:</b> los datos son ficticios y todo lo que registres se marcará como DEMO.
              {can('settings.manage') && (
                <>
                  {' '}
                  <button className="underline underline-offset-2" onClick={() => navigate('configuracion')}>
                    Gestionar
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>

      {/* Navegación inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-cream-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
        {bottom.map((n) => {
          const Icon = n.icon;
          const active = n.name === current;
          return (
            <button key={n.name} onClick={() => go(n.name)} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', active ? 'text-brand-600' : 'text-ink-500')}>
              <Icon className="size-5" />
              {n.name === 'plan' ? 'Plan' : navLabel(n, can).split(' ')[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
