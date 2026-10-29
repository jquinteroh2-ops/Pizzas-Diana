// Pestaña «Inventario» de la hoja del día: la hoja de papel en la pantalla.
// En el computador se ven y se llenan todas las columnas; en el celular se elige qué se
// está anotando (Inicio, Llegó o Fin) y cada ingrediente queda como un renglón grande.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Copy, Pencil, Plus, Printer, Search, Server } from 'lucide-react';
import { api } from '../../lib/api';
import type { DaySheet, DaySheetLine, SheetField } from '../../../shared/daySheet.ts';
import { LOCATIONS, type Location } from '../../../shared/kitchen.ts';
import { useToast } from '../toast';
import { Segmented, cx } from '../ui';
import { LOCATION_ICONS } from '../kitchen/helpers';
import { QtyCell } from './QtyCell';
import { IngredientModal, type IngredientBase } from './IngredientModal';
import { packDescription, qtyText, signedText } from './qty';

const COLUMN_HELP: Record<SheetField, string> = {
  open: 'Al abrir: lo que hay en cada nevera.',
  entry: 'Lo que llegó hoy del proveedor. Se suma al inventario de una vez.',
  close: 'Al cerrar: lo que quedó. El consumo se calcula solo.',
};

function defaultColumn(sheet: DaySheet): SheetField {
  const { items, open_filled, close_filled } = sheet.summary;
  if (close_filled > 0) return 'close';
  return open_filled >= Math.ceil(items * 0.6) ? 'close' : 'open';
}

/** Lo que pasó con el ingrediente en el día, en una línea corta. */
function Moves({ l, className }: { l: DaySheetLine; className?: string }) {
  const parts: ReactNode[] = [];
  if (l.produced_m) parts.push(<span key="p">Preparado {signedText(l.produced_m, l)}</span>);
  if (l.used_m) parts.push(<span key="u">En preparaciones {signedText(-l.used_m, l)}</span>);
  if (l.waste_m) parts.push(<span key="w">Bajas {signedText(-l.waste_m, l)}</span>);
  if (!parts.length) return null;
  return <span className={cx('flex flex-wrap gap-x-3 gap-y-0.5', className)}>{parts}</span>;
}

function Consumption({ l }: { l: DaySheetLine }) {
  if (l.consumption_m === null) return <span className="text-ink-400">—</span>;
  return <span className={cx('font-semibold tabular-nums', l.consumption_m < 0 ? 'text-amber-700' : 'text-ink-900')}>{qtyText(Math.abs(l.consumption_m), l) || '0'}{l.consumption_m < 0 ? ' de más' : ''}</span>;
}

export function InventoryTab({
  sheet,
  lines,
  onLine,
  onSheet,
}: {
  sheet: DaySheet;
  lines: DaySheetLine[];
  onLine: (l: DaySheetLine) => void;
  onSheet: (s: DaySheet) => void;
}) {
  const toast = useToast();
  const [col, setCol] = useState<SheetField>(() => defaultColumn(sheet));
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Set<Location>>(new Set());
  const [modal, setModal] = useState<{ ingredient?: IngredientBase; location?: Location } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = sheet.editable;

  const save = (l: DaySheetLine, field: SheetField) => async (milli: number | null) => {
    try {
      const line = await api.post<DaySheetLine>('/day-sheet/cell', { date: sheet.date, item_id: l.item_id, field, value_m: milli });
      onLine(line);
    } catch (e) {
      toast.fail(e);
      throw e;
    }
  };

  const fill = async (source: 'ayer' | 'sistema') => {
    setBusy(true);
    try {
      const s = await api.post<DaySheet>('/day-sheet/fill-open', { date: sheet.date, source });
      onSheet(s);
      const n = s.summary.open_filled - sheet.summary.open_filled;
      toast.success('Inicio llenado', `${n} ingrediente${n === 1 ? '' : 's'}. Revisa y corrige lo que no coincida.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const term = q.trim().toLowerCase();
  const sections = useMemo(() => {
    const shown = term ? lines.filter((l) => l.name.toLowerCase().includes(term)) : lines;
    return LOCATIONS.map((loc) => ({ loc, lines: shown.filter((l) => l.location === loc) })).filter((s) => s.lines.length);
  }, [lines, term]);

  const missingOpen = lines.filter((l) => l.open_m === null);
  const canCopy = editable && missingOpen.some((l) => l.prev_close_m !== null);
  const s = sheet.summary;
  const toggle = (loc: Location) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(loc)) n.delete(loc);
      else n.add(loc);
      return n;
    });

  const cell = (l: DaySheetLine, field: SheetField, big?: boolean) => {
    const value = field === 'open' ? l.open_m : field === 'close' ? l.close_m : l.entries_m || null;
    const can = field === 'entry' ? sheet.entries_editable : editable;
    if (!can) return <span className="tabular-nums text-ink-700">{qtyText(value, l) || <span className="text-ink-400">—</span>}</span>;
    return <QtyCell value={value} measure={l} col={field} label={`${l.name}: ${field === 'open' ? 'inicio' : field === 'close' ? 'fin' : 'llegó'}`} big={big} onSave={save(l, field)} />;
  };

  const editButton = (l: DaySheetLine) =>
    editable && (
      <button
        className="rounded-md p-1 text-ink-400 hover:bg-cream-200 hover:text-ink-900 print:hidden"
        onClick={() => setModal({ ingredient: l })}
        aria-label={`Editar ${l.name}`}
        title="Cambiar unidad, paquete o lugar"
      >
        <Pencil className="size-3.5" />
      </button>
    );

  return (
    <div>
      {/* Barra de herramientas */}
      <div className="mb-4 flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ingrediente" aria-label="Buscar ingrediente" />
          </div>
          {editable && (
            <button className="btn-secondary" onClick={() => setModal({})}>
              <Plus className="size-4" /> Agregar ingrediente
            </button>
          )}
          <button className="btn-ghost hidden md:inline-flex" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </button>
        </div>

        {/* En el celular: qué se está anotando */}
        <div className="md:hidden">
          <Segmented
            value={col}
            onChange={setCol}
            options={[
              { value: 'open', label: `Inicio ${s.open_filled}/${s.items}` },
              { value: 'entry', label: 'Llegó' },
              { value: 'close', label: `Fin ${s.close_filled}/${s.items}` },
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-500">{COLUMN_HELP[col]}</p>
        </div>
        <p className="hidden text-xs text-ink-500 md:block">
          Escribe en las casillas y se guarda solo. <b>Enter</b> baja a la siguiente. Con paquete se escribe como en el papel: paquetes cerrados + lo que queda del abierto.
          {!sheet.entries_editable && editable && ' «Llegó» solo se anota el mismo día.'}
        </p>

        {editable && missingOpen.length > 0 && (
          // En el celular solo se ve mientras se anota el inicio.
          <div className={cx('flex flex-wrap items-center gap-2 rounded-2xl border border-cream-300 bg-white px-4 py-3', col !== 'open' && 'hidden md:flex')}>
            <p className="mr-auto text-sm text-ink-700">
              Faltan <b>{missingOpen.length}</b> por escribir en el inicio.
            </p>
            {canCopy && (
              <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void fill('ayer')}>
                <Copy className="size-4" /> Copiar el fin de ayer
              </button>
            )}
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void fill('sistema')} title="Llena el inicio con lo que lleva el sistema">
              <Server className="size-4" /> Usar lo del sistema
            </button>
          </div>
        )}
      </div>

      {sections.length === 0 && <p className="py-10 text-center text-sm text-ink-500">No hay ingredientes con ese nombre.</p>}

      <div className="space-y-4">
        {sections.map(({ loc, lines: ls }) => {
          const Icon = LOCATION_ICONS[loc];
          const isClosed = closed.has(loc) && !term;
          const closeDone = ls.filter((l) => l.close_m !== null).length;
          const openDone = ls.filter((l) => l.open_m !== null).length;
          return (
            <section key={loc} className="card overflow-hidden print:break-inside-avoid print:rounded-none print:shadow-none">
              <button className="flex w-full items-center gap-3 border-b border-cream-200 bg-cream-50 px-4 py-3 text-left" onClick={() => toggle(loc)} aria-expanded={!isClosed}>
                <Icon className="size-5 text-ink-500" />
                <span className="font-display text-lg font-semibold text-ink-900">{loc}</span>
                <span className="ml-auto text-xs text-ink-500 tabular-nums">
                  Inicio {openDone}/{ls.length} · Fin {closeDone}/{ls.length}
                </span>
                <ChevronDown className={cx('size-4 text-ink-400 transition-transform print:hidden', isClosed && '-rotate-90')} />
              </button>

              {!isClosed && (
                <>
                  {/* Computador: la hoja completa */}
                  <div className="hidden overflow-x-auto md:block print:block">
                    <table className="w-full min-w-[820px] border-collapse">
                      <thead>
                        <tr className="border-b border-cream-200 text-left text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                          <th className="px-4 py-2">Ingrediente</th>
                          <th className="px-2 py-2">Inicio</th>
                          <th className="px-2 py-2">Llegó</th>
                          <th className="px-2 py-2">Preparado / bajas</th>
                          <th className="px-2 py-2">Fin</th>
                          <th className="px-4 py-2 text-right">Consumo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ls.map((l) => (
                          <tr key={l.item_id} className="border-b border-cream-200/70 last:border-0 hover:bg-cream-50/60">
                            <td className="px-4 py-2 align-middle">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-ink-900">{l.name}</span>
                                {editButton(l)}
                              </div>
                              {l.pack_size_m > 0 && <span className="block text-[11px] text-ink-500">{packDescription(l)}</span>}
                            </td>
                            <td className="px-2 py-2">{cell(l, 'open')}</td>
                            <td className="px-2 py-2">{cell(l, 'entry')}</td>
                            <td className="px-2 py-2 text-xs text-ink-500">
                              <Moves l={l} className="flex-col" />
                            </td>
                            <td className="px-2 py-2">
                              {cell(l, 'close')}
                              {l.close_m === null && l.expected_close_m !== null && editable && (
                                <span className="mt-0.5 block text-[11px] text-ink-400 print:hidden">Debería quedar ≈ {qtyText(Math.max(0, l.expected_close_m), l) || '0'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-sm">
                              <Consumption l={l} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Celular: un renglón grande por ingrediente con la columna elegida */}
                  <ul className="divide-y divide-cream-200 md:hidden print:hidden">
                    {ls.map((l) => {
                      const other = [
                        col !== 'open' && l.open_m !== null ? `Inicio ${qtyText(l.open_m, l)}` : null,
                        col !== 'entry' && l.entries_m ? `Llegó ${qtyText(l.entries_m, l)}` : null,
                        col !== 'close' && l.close_m !== null ? `Fin ${qtyText(l.close_m, l)}` : null,
                      ].filter(Boolean);
                      return (
                        <li key={l.item_id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-ink-900">{l.name}</span>
                                {editButton(l)}
                              </div>
                              {l.pack_size_m > 0 && <span className="block text-xs text-ink-500">{packDescription(l)}</span>}
                            </div>
                            {l.consumption_m !== null && (
                              <span className="shrink-0 text-right text-xs text-ink-500">
                                Consumo
                                <span className="block text-sm">
                                  <Consumption l={l} />
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="mt-2">{cell(l, col, true)}</div>
                          {col === 'close' && l.close_m === null && l.expected_close_m !== null && editable && (
                            <p className="mt-1 text-xs text-ink-400">Debería quedar ≈ {qtyText(Math.max(0, l.expected_close_m), l) || '0'}</p>
                          )}
                          {(other.length > 0 || l.produced_m || l.used_m || l.waste_m) && (
                            <div className="mt-1.5 text-xs text-ink-500">
                              {other.length > 0 && <span className="mr-3">{other.join(' · ')}</span>}
                              <Moves l={l} className="inline-flex" />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {editable && (
                    <button className="flex w-full items-center gap-2 border-t border-cream-200 px-4 py-2.5 text-sm font-semibold text-ink-500 hover:bg-cream-50 hover:text-ink-900 print:hidden" onClick={() => setModal({ location: loc })}>
                      <Plus className="size-4" /> Agregar en {loc}
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-ink-500">
        <b>Consumo</b> = inicio + llegó + preparado − lo usado en preparaciones − bajas − fin. Es lo que salió en platos; en <b>Validar</b> se compara con lo que vendió la caja.
      </p>

      {modal && (
        <IngredientModal
          ingredient={modal.ingredient}
          defaultLocation={modal.location}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}
