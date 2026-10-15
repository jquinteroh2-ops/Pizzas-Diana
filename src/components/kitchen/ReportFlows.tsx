// «Falta algo» y «Dar de baja»: los dos avisos que puede hacer cualquier persona.
import { useRef, useState, type FormEvent } from 'react';
import { Camera, CheckCircle2, Loader2, Megaphone, X, ImageOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Shortage, Waste } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, ErrorBox, Field, Badge, cx } from '../ui';
import { formatQty, type Unit } from '../../../shared/units.ts';
import { SHORTAGE_LEVEL_LABELS, WASTE_REASONS, WASTE_REASON_LABELS, type ShortageLevel, type WasteReason } from '../../../shared/kitchen.ts';
import { ItemPicker, QtyInput } from './common';
import { compressPhoto, parseQty, smallUnit, validQty } from './helpers';

// ---------- Falta algo ----------

export function ShortageFlow({ onClose }: { onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/kitchen/items');
  const open = useApi<Shortage[]>('/shortages?scope=open');
  const [item, setItem] = useState<Item | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ShortageLevel | null>(null);
  const [sent, setSent] = useState<(Shortage & { merged: boolean }) | null>(null);

  const reported = new Map((open.data ?? []).map((s) => [s.item_id, s]));

  const send = async (level: ShortageLevel) => {
    if (!item) return;
    setBusy(level);
    try {
      const s = await api.post<Shortage & { merged: boolean }>('/shortages', { item_id: item.id, level, note });
      bump();
      setSent(s);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={sent ? 'Aviso enviado' : item ? item.name : '¿Qué falta?'} subtitle={!sent && !item ? 'Busca el producto y toca para avisar.' : undefined}>
      {sent ? (
        <Sent
          title={sent.merged ? 'Ya estaba reportado: se actualizó el aviso' : 'El administrador ya lo puede ver'}
          text={`${sent.item_name}: ${SHORTAGE_LEVEL_LABELS[sent.level].toLowerCase()}. Aparece en la lista de compras.`}
          onAgain={() => {
            setSent(null);
            setItem(null);
            setNote('');
          }}
          againText="Avisar otro producto"
          onClose={onClose}
        />
      ) : items.error ? (
        <ErrorBox message={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <Loading />
      ) : !item ? (
        <ItemPicker
          items={items.data}
          onPick={setItem}
          right={(i) => {
            const s = reported.get(i.id);
            return s ? <Badge tone={s.level === 'agotado' ? 'red' : 'amber'}>Ya avisado</Badge> : null;
          }}
        />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-500">
            {item.location} · el sistema dice que hay <b className="text-ink-900">{formatQty(item.qty_m, item.unit)}</b>
          </p>
          {reported.get(item.id) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {reported.get(item.id)!.reported_by_name} ya avisó ({SHORTAGE_LEVEL_LABELS[reported.get(item.id)!.level].toLowerCase()}). Si avisas otra vez se actualiza el mismo aviso.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(['poco', 'agotado'] as const).map((level) => (
              <button
                key={level}
                type="button"
                disabled={!!busy}
                onClick={() => void send(level)}
                className={cx(
                  'flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl p-4 font-display text-lg font-semibold shadow-lg transition-transform active:scale-[0.97] disabled:opacity-60',
                  level === 'poco' ? 'bg-gradient-to-br from-crust-300 to-crust-500 text-ink-900' : 'bg-gradient-to-br from-brand-600 to-brand-800 text-white',
                )}
              >
                {busy === level ? <Loader2 className="size-6 animate-spin" /> : <Megaphone className="size-6" />}
                {SHORTAGE_LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
          <Field label="Nota (opcional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej. alcanza solo para hoy" />
          </Field>
          <button type="button" className="btn-ghost w-full" onClick={() => setItem(null)}>
            Elegir otro producto
          </button>
        </div>
      )}
    </Modal>
  );
}

// ---------- Dar de baja ----------

export function WasteFlow({ onClose }: { onClose: () => void }) {
  const { bump, can } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/kitchen/items');
  const [item, setItem] = useState<Item | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [reason, setReason] = useState<WasteReason | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Waste | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (i: Item) => {
    setItem(i);
    setUnit(smallUnit(i.base_unit));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      setPhoto(await compressPhoto(f));
    } catch (e) {
      toast.fail(e, 'No se pudo usar la foto');
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item || !reason) return;
    setBusy(true);
    try {
      const w = await api.post<Waste>('/wastes', { item_id: item.id, qty: parseQty(qty), unit, reason, note, photo });
      bump();
      setSent(w);
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSent(null);
    setItem(null);
    setQty('');
    setReason(null);
    setNote('');
    setPhoto(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={sent ? 'Baja registrada' : item ? `Dar de baja: ${item.name}` : '¿Qué se va a botar?'}
      subtitle={!sent && !item ? 'Toda baja la autoriza el administrador. Toma una foto como evidencia.' : undefined}
    >
      {sent ? (
        <Sent
          title={sent.status === 'aprobada' ? 'Aprobada y descontada del inventario' : 'Quedó pendiente de autorizar'}
          text={`${formatQty(sent.qty_m, sent.unit)} de ${sent.item_name} · ${WASTE_REASON_LABELS[sent.reason]}.${
            sent.status === 'pendiente' ? ' Se descuenta del inventario cuando el administrador la apruebe.' : ''
          }`}
          onAgain={reset}
          againText="Dar de baja otro producto"
          onClose={onClose}
        />
      ) : items.error ? (
        <ErrorBox message={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <Loading />
      ) : !item ? (
        <ItemPicker items={items.data} onPick={pick} />
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="¿Cuánto?" hint={`Hay ${formatQty(item.qty_m, item.unit)} según el sistema.`}>
            <QtyInput value={qty} onChange={setQty} unit={unit} onUnit={setUnit} base={item.base_unit} autoFocus big />
          </Field>
          <div>
            <span className="label">Motivo</span>
            <div className="grid grid-cols-2 gap-2">
              {WASTE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cx(
                    'rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all',
                    reason === r ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400',
                  )}
                >
                  {WASTE_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          <Field label={reason === 'otro' ? 'Detalle (obligatorio)' : 'Detalle (opcional)'}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. poca rotación, tenía moho" required={reason === 'otro'} minLength={reason === 'otro' ? 3 : undefined} />
          </Field>

          <div>
            <span className="label">Foto de evidencia</span>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            {photo ? (
              <div className="relative overflow-hidden rounded-2xl border border-cream-300">
                <img src={photo} alt="Foto de la baja" className="max-h-64 w-full object-cover" />
                <button type="button" className="absolute top-2 right-2 rounded-full bg-ink-900/70 p-2 text-white" onClick={() => setPhoto(null)} aria-label="Quitar foto">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm font-semibold text-ink-700 hover:border-brand-300"
              >
                {photoBusy ? <Loader2 className="size-7 animate-spin text-brand-600" /> : <Camera className="size-7 text-brand-600" />}
                Tomar foto
                <span className="text-xs font-normal text-ink-500">Sin foto el administrador podría rechazarla.</span>
              </button>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-cream-200 pt-4 sm:flex-row sm:justify-between">
            <button type="button" className="btn-ghost" onClick={() => setItem(null)}>
              Elegir otro producto
            </button>
            <button className="btn-danger py-3 sm:px-6" disabled={busy || !reason || !validQty(qty)}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {can('kitchen.manage') ? 'Dar de baja' : 'Enviar para autorizar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Sent({ title, text, onAgain, againText, onClose }: { title: string; text: string; onAgain: () => void; againText: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="size-9" />
      </span>
      <p className="mt-4 font-display text-xl font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
        <button className="btn-secondary flex-1" onClick={onAgain}>
          {againText}
        </button>
        <button className="btn-primary flex-1" onClick={onClose}>
          Terminar
        </button>
      </div>
    </div>
  );
}

/** Foto de una baja, cargada solo cuando se necesita (no viaja en la lista). */
export function WastePhoto({ id, className }: { id: number; className?: string }) {
  const photo = useApi<{ photo: string | null }>(`/wastes/${id}/photo`, [id]);
  if (!photo.data) return <div className={cx('animate-pulse bg-cream-200', className)} />;
  if (!photo.data.photo)
    return (
      <div className={cx('grid place-items-center bg-cream-100 text-ink-400', className)}>
        <ImageOff className="size-6" />
      </div>
    );
  return <img src={photo.data.photo} alt="Evidencia de la baja" className={cx('object-cover', className)} />;
}
