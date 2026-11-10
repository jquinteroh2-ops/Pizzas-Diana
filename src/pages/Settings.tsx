import { useState, type FormEvent } from 'react';
import { Database, KeyRound, Loader2, ClipboardList } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useToast } from '../components/toast';
import { PageHeader, ConfirmModal, Field } from '../components/ui';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" subtitle="Catálogo de Pizza Diana y seguridad de tu cuenta." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePassword />
        <CatalogCard />
      </div>
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
    <section className="card p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ClipboardList className="size-5 text-brand-600" /> Catálogo de Pizza Diana
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        Carga de una vez lo que está en las hojas de inventario de la pizzería (congelador, nevera negra, nevera Coca-Cola y bodega), las preparaciones de cocina (masa,
        cebolla caramelizada, pechuga desmechada…) y el menú con las recetas de la pizzería. Todo queda con existencia 0, listo para el primer conteo. Lo que ya
        exista con el mismo nombre no se toca.
      </p>
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
