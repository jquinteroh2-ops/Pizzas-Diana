import { useState, type FormEvent } from 'react';
import { FlaskConical, RotateCcw, Trash2, Database, KeyRound, Loader2, Info, ClipboardList } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useApp } from '../lib/app';
import type { DemoStatus } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, ConfirmModal, Field } from '../components/ui';

type DemoAction = 'load' | 'reset' | 'clear';

const COPY: Record<DemoAction, { title: string; text: string; button: string; ok: string }> = {
  load: {
    title: 'Cargar datos de demostración',
    text: 'Se cargará el inventario de Pizza Diana por nevera, sus preparaciones, el menú con recetas, una cajera y dos cocineros ficticios sin acceso, y unas 5 semanas de ventas, preparaciones, bajas y conteos. Todo quedará marcado como DEMO y podrá borrarse después sin dejar rastro.',
    button: 'Cargar demostración',
    ok: 'Demostración cargada',
  },
  reset: {
    title: 'Restablecer la demostración',
    text: 'Se borrará todo lo marcado como DEMO (incluidas las ventas que hayas registrado durante la demostración) y se volverá a cargar el estado inicial.',
    button: 'Restablecer',
    ok: 'Demostración restablecida',
  },
  clear: {
    title: 'Salir del modo demostración',
    text: 'Se borrarán todos los artículos, productos, ventas y movimientos DEMO. El sistema quedará vacío y listo para cargar la información real de Pizza Diana. Tu usuario no se borra.',
    button: 'Borrar datos DEMO',
    ok: 'Datos DEMO eliminados',
  },
};

export default function SettingsPage() {
  const { reloadSession, bump } = useApp();
  const toast = useToast();
  const status = useApi<DemoStatus>('/settings/demo');
  const [action, setAction] = useState<DemoAction | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await api.post(`/settings/demo/${action}`);
      toast.success(COPY[action].ok);
      setAction(null);
      await reloadSession();
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const s = status.data;
  const hasReal = s ? s.real.items + s.real.products + s.real.sales > 0 : false;

  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos de demostración y seguridad de tu cuenta." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <FlaskConical className="size-5 text-violet-700" /> Datos de demostración
          </h2>
          {status.error ? (
            <ErrorBox message={status.error} />
          ) : !s ? (
            <Loading />
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-500">
                Sirven para presentar el sistema antes de cargar el inventario real. Las ventas DEMO se registran con la misma lógica de recetas y descuentos, así que los gráficos coinciden con lo guardado.
              </p>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ['Artículos', s.demo.items, s.real.items],
                    ['Productos', s.demo.products, s.real.products],
                    ['Ventas', s.demo.sales, s.real.sales],
                  ] as const
                ).map(([label, demo, real]) => (
                  <div key={label} className="rounded-2xl bg-cream-100 p-3">
                    <dt className="text-xs font-semibold text-ink-500 uppercase">{label}</dt>
                    <dd className="mt-1 text-sm">
                      <b className="font-display text-xl">{demo}</b> <span className="text-xs text-violet-700">demo</span>
                    </dd>
                    <dd className="text-xs text-ink-500">{real} reales</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {!s.demoMode ? (
                  <button className="btn-primary" onClick={() => setAction('load')} disabled={hasReal}>
                    <Database className="size-4" /> Cargar datos DEMO
                  </button>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={() => setAction('reset')}>
                      <RotateCcw className="size-4" /> Restablecer demostración
                    </button>
                    <button className="btn-danger" onClick={() => setAction('clear')}>
                      <Trash2 className="size-4" /> Salir del modo demo
                    </button>
                  </>
                )}
              </div>
              {hasReal && !s.demoMode && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-cream-100 p-3 text-xs text-ink-700">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  Ya hay información real registrada. Para no mezclarla con datos ficticios, la demostración solo se puede cargar en un sistema vacío.
                </p>
              )}
            </>
          )}
        </section>

        <ChangePassword />
        {s && !s.demoMode && <CatalogCard />}
      </div>

      <ConfirmModal
        open={!!action}
        onClose={() => setAction(null)}
        onConfirm={run}
        busy={busy}
        danger={action === 'clear'}
        title={action ? COPY[action].title : ''}
        confirmText={action ? COPY[action].button : ''}
      >
        {action && COPY[action].text}
      </ConfirmModal>
    </>
  );
}

/** Carga los productos de las hojas de Pizza Diana (con existencia 0), sus preparaciones y el menú. */
function CatalogCard() {
  const { bump } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ items: number; preparations: number; products: number }>('/settings/catalog');
      toast.success('Catálogo cargado', `${r.items} productos de inventario, ${r.preparations} preparaciones y ${r.products} platos del menú.`);
      setOpen(false);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-6 lg:col-span-2">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ClipboardList className="size-5 text-brand-600" /> Catálogo de Pizza Diana
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        Carga de una vez lo que está en las hojas de inventario de la pizzería (congelador, nevera negra, nevera Coca-Cola y bodega), las preparaciones de cocina (masa,
        cebolla caramelizada, pechuga desmechada…) y el menú con recetas sugeridas. Todo queda con existencia 0, listo para el primer conteo. Lo que ya exista con el
        mismo nombre no se toca.
      </p>
      <p className="mt-2 text-xs text-amber-800">Las cantidades por plato son sugeridas: revísalas con el dueño en «Productos y recetas» antes de vender.</p>
      <button className="btn-primary mt-4" onClick={() => setOpen(true)}>
        <Database className="size-4" /> Cargar catálogo
      </button>
      <ConfirmModal open={open} onClose={() => setOpen(false)} onConfirm={() => void run()} busy={busy} title="Cargar catálogo de Pizza Diana" confirmText="Cargar">
        Se agregarán los productos, preparaciones y platos que todavía no existan. No se borra nada.
      </ConfirmModal>
    </section>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/me/password', { current, next });
      toast.success('Contraseña actualizada');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <KeyRound className="size-5 text-brand-600" /> Mi contraseña
      </h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Contraseña actual">
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <button className="btn-primary" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Cambiar contraseña
        </button>
      </form>
    </section>
  );
}
