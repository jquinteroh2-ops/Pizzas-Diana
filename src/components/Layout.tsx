import { useState, type ReactNode } from 'react';
import {
  Sun,
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
  ClipboardList,
  History,
  ChevronDown,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from './Logo';
import { cx } from './ui';
import { navigate, useApp, type Action, type RouteName } from '../lib/app';
import { ROLE_LABELS, type Role } from '../../shared/permissions.ts';

type NavGroup = 'principal' | 'mas';

interface NavItem {
  name: RouteName;
  label: string;
  icon: LucideIcon;
  /** Quién ve la sección. Cada rol ve solo lo suyo para no enredarse. */
  roles: Role[];
  need?: Action;
  group: NavGroup;
}

// Menú corto por rol. El orden importa: la primera sección permitida es la de inicio
// (administrador → Hoy, caja → Vender, jefe de cocina → la hoja del día, que no tiene menú).
// La hoja del día reúne inventario, preparaciones (merma y masa), bajas, pedido y la validación con la caja.
export const NAV: NavItem[] = [
  { name: 'hoy', label: 'Hoy', icon: Sun, roles: ['admin'], group: 'principal' },
  { name: 'hoja', label: 'Hoja del día', icon: ClipboardList, roles: ['admin', 'cocina'], need: 'sheet.use', group: 'principal' },
  { name: 'vender', label: 'Vender', icon: ShoppingBag, roles: ['caja'], need: 'sales.create', group: 'principal' },
  { name: 'historial', label: 'Mis ventas', icon: History, roles: ['caja'], need: 'sales.create', group: 'principal' },
  { name: 'mas-vendidos', label: 'Más vendidos', icon: Trophy, roles: ['admin'], group: 'principal' },
  { name: 'hoja-ventas', label: 'Ventas del día', icon: ReceiptText, roles: ['admin', 'caja'], need: 'reports.view', group: 'principal' },
  { name: 'vender', label: 'Registrar venta', icon: ShoppingBag, roles: ['admin'], group: 'mas' },
  { name: 'historial', label: 'Historial de ventas', icon: History, roles: ['admin'], group: 'mas' },
  { name: 'productos', label: 'Productos y recetas', icon: Pizza, roles: ['admin'], group: 'mas' },
  { name: 'inventario', label: 'Existencias y movimientos', icon: Package, roles: ['admin', 'caja'], need: 'inventory.view', group: 'mas' },
  { name: 'cocina', label: 'Preparaciones y bajas', icon: ChefHat, roles: ['admin'], group: 'mas' },
  { name: 'reportes', label: 'Reportes', icon: BarChart3, roles: ['admin'], group: 'mas' },
  { name: 'usuarios', label: 'Usuarios', icon: Users, roles: ['admin'], group: 'mas' },
  { name: 'configuracion', label: 'Configuración', icon: Settings, roles: ['admin'], group: 'mas' },
];

export function allowedNav(can: (a: Action) => boolean, role: Role) {
  return NAV.filter((n) => n.roles.includes(role) && (!n.need || can(n.need)));
}

const MORE_KEY = 'pd_menu_mas';

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
  const items = allowedNav(can, user.role);
  const inMore = items.some((n) => n.group === 'mas' && n.name === current);
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento: solo se recuerda mientras la página esté abierta.
    }
  };
  // En el celular, la barra inferior muestra las secciones principales.
  const bottom = items.filter((i) => i.group !== 'mas').slice(0, 4);

  const go = (n: RouteName) => {
    setOpen(false);
    navigate(n);
  };

  const navButton = (n: (typeof items)[number]) => {
    const active = n.name === current;
    const Icon = n.icon;
    return (
      <button
        key={n.name}
        onClick={() => go(n.name)}
        className={cx(
          'group flex items-center gap-3 rounded-xl px-3.5 py-2 text-left text-sm font-medium transition-all',
          active ? 'bg-white/[0.09] text-white shadow-inner' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
        )}
        aria-current={active ? 'page' : undefined}
      >
        <span className={cx('grid size-8 place-items-center rounded-lg transition-colors', active ? 'bg-brand-600 text-white' : 'bg-white/[0.04] text-white/70 group-hover:text-white')}>
          <Icon className="size-[18px]" />
        </span>
        {n.label}
      </button>
    );
  };

  const main = items.filter((n) => n.group === 'principal');
  const more = items.filter((n) => n.group === 'mas');
  const showMore = moreOpen || inMore;

  const navList = (
    <nav className="flex flex-col gap-0.5">
      {main.map(navButton)}
      {more.length > 0 && (
        <>
          <button
            onClick={toggleMore}
            className="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2 text-left text-[11px] font-bold tracking-wider text-white/45 uppercase hover:text-white/80"
            aria-expanded={showMore}
          >
            Más
            <ChevronDown className={cx('size-4 transition-transform', showMore && 'rotate-180')} />
          </button>
          {showMore && more.map(navButton)}
        </>
      )}
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

  // La jefa de cocina no tiene menú: trabaja en la hoja del día, con un botón para salir.
  if (user.role === 'cocina') {
    return (
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-cream-300/60 bg-cream-100/95 px-4 py-3 backdrop-blur print:hidden">
          <Logo compact />
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-sm leading-tight sm:block">
              <span className="block font-semibold text-ink-900">{user.name}</span>
              <span className="text-xs text-ink-500">{ROLE_LABELS[user.role]}</span>
            </span>
            <button onClick={logout} className="flex items-center gap-2 rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 hover:bg-cream-50">
              <LogOut className="size-4" /> Salir
            </button>
          </div>
        </header>
        {session.demoMode && <p className="bg-violet-700 px-4 py-1.5 text-center text-sm font-medium text-white">Modo demostración: los datos son de prueba.</p>}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-16 sm:px-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-8 p-5 lg:flex print:hidden', sidebarBg)}>
        <div className="px-2 pt-2">
          <Logo light />
        </div>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        {userBox}
      </aside>

      {/* Barra superior (tablet y celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-300/60 bg-cream-100/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
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

      <main className="pb-24 lg:pb-10 lg:pl-72 print:p-0">
        {session.demoMode && (
          <div className="flex items-center justify-center gap-2 bg-violet-700 px-4 py-2 text-center text-xs font-medium text-white print:hidden">
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid print:hidden border-t border-cream-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
        {bottom.map((n) => {
          const Icon = n.icon;
          const active = n.name === current;
          return (
            <button key={n.name} onClick={() => go(n.name)} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', active ? 'text-brand-600' : 'text-ink-500')}>
              <Icon className="size-5" />
              {n.label.length <= 10 ? n.label : n.label.split(' ')[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
