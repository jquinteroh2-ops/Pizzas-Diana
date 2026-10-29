// Una casilla de la hoja del día. Se escribe como en el papel («3 paq + 385 g») y se guarda
// sola al salir de la casilla o con Enter (que además baja a la siguiente, como en una hoja de cálculo).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { cx } from '../ui';
import { draftToMilli, looseUnit, packWord, toDraft, unitShort, type Draft, type Measure } from './qty';

type Status = 'idle' | 'saving' | 'saved' | 'error';

/** Lleva el foco a la casilla siguiente (o anterior) de la misma columna que esté visible. */
function moveFocus(from: HTMLElement, col: string, step: 1 | -1) {
  const all = [...document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"][data-first]`)].filter((el) => el.offsetParent !== null);
  const group = from.closest('[data-cell]');
  const idx = all.findIndex((el) => el.closest('[data-cell]') === group);
  const next = all[idx + step];
  if (next) {
    next.focus();
    next.select();
  }
}

export function QtyCell({
  value,
  measure,
  col,
  label,
  disabled,
  big,
  paper,
  onSave,
}: {
  value: number | null;
  measure: Measure;
  /** Columna (open, entry, close): sirve para bajar con Enter. */
  col: string;
  /** Nombre para lectores de pantalla: «Queso: inicio». */
  label: string;
  disabled?: boolean;
  /** Casillas más grandes (celular). */
  big?: boolean;
  /** Como escrito a mano en la hoja: sin recuadro y en tinta azul. */
  paper?: boolean;
  onSave: (milli: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value, measure));
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const focused = useRef(false);
  // Solo se guarda si se escribió algo: entrar y salir de la casilla no cambia nada.
  const dirty = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // Si el dato cambia desde afuera (otra pantalla, «copiar el fin de ayer»), se muestra, salvo que se esté escribiendo.
  useEffect(() => {
    if (!focused.current) setDraft(toDraft(value, measure));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, measure.pack_size_m, measure.unit]);

  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(() => setStatus('idle'), 1600);
    return () => clearTimeout(t);
  }, [status]);

  const commit = async () => {
    if (!dirty.current) return;
    const milli = draftToMilli(draft, measure);
    if (Number.isNaN(milli)) {
      setStatus('error');
      setError('Escribe solo números');
      return;
    }
    if (milli === value) {
      dirty.current = false;
      if (status === 'error') setStatus('idle');
      return;
    }
    setStatus('saving');
    try {
      await onSave(milli);
      dirty.current = false;
      setStatus('saved');
      setError('');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'No se guardó');
    }
  };

  const onBlur = () => {
    // Se guarda cuando el foco sale de la casilla completa (paquetes + suelto), no al pasar de una a otra.
    setTimeout(() => {
      if (box.current && !box.current.contains(document.activeElement)) {
        focused.current = false;
        void commit();
      }
    }, 0);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(e.currentTarget, col, e.key === 'ArrowUp' ? -1 : 1);
      if (e.key === 'Enter' && document.activeElement === e.currentTarget) e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(toDraft(value, measure));
      dirty.current = false;
      setStatus('idle');
      e.currentTarget.blur();
    }
  };

  const set = (k: keyof Draft, v: string) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, [k]: v.replace(/[^0-9.,]/g, '') }));
    if (status === 'error') setStatus('idle');
  };

  const input = paper
    ? cx(
        // Hoja de papel: la casilla no se nota hasta que se toca; lo escrito queda en «tinta» azul.
        'rounded border border-dashed bg-transparent text-center font-semibold tabular-nums text-[#1f3f8f] placeholder:text-ink-400/40 hover:border-ink-400 focus:border-solid focus:border-ink-900 focus:bg-amber-50 focus:outline-none disabled:border-transparent disabled:text-ink-700',
        big ? 'h-10 text-[17px]' : 'h-8 text-[15px]',
        status === 'error' ? 'border-brand-600 bg-brand-50' : 'border-ink-400/30',
      )
    : cx(
        'rounded-lg border bg-white text-center tabular-nums text-ink-900 placeholder:text-ink-400/70 focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10 focus:outline-none disabled:border-transparent disabled:bg-transparent disabled:text-ink-700',
        big ? 'h-11 text-base' : 'h-9 text-sm',
        status === 'error' ? 'border-brand-600' : 'border-cream-300',
      );
  const hasPack = measure.pack_size_m > 0;
  const lu = unitShort(looseUnit(measure));

  return (
    <div ref={box} data-cell className="relative inline-flex items-center gap-1" title={status === 'error' ? error : undefined}>
      {hasPack && (
        <>
          <input
            data-col={col}
            data-first
            className={cx(input, paper ? (big ? 'w-11' : 'w-10') : big ? 'w-14' : 'w-11')}
            inputMode="decimal"
            enterKeyHint="next"
            value={draft.packs}
            placeholder={paper ? '' : '0'}
            disabled={disabled}
            aria-label={`${label}: ${packWord(measure.pack_label)}`}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onBlur={onBlur}
            onKeyDown={onKey}
            onChange={(e) => set('packs', e.target.value)}
          />
          <span className="text-xs whitespace-nowrap text-ink-500">{packWord(measure.pack_label)} +</span>
        </>
      )}
      <input
        data-col={col}
        data-first={hasPack ? undefined : true}
        className={cx(input, paper ? 'w-14' : big ? 'w-20' : 'w-16')}
        inputMode="decimal"
        enterKeyHint="next"
        value={draft.loose}
        placeholder={paper ? '' : hasPack ? '0' : '—'}
        disabled={disabled}
        aria-label={`${label}: ${lu}`}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={onBlur}
        onKeyDown={onKey}
        onChange={(e) => set('loose', e.target.value)}
      />
      <span className="w-7 text-xs whitespace-nowrap text-ink-500">{lu}</span>
      <span className="absolute -right-1 -top-1.5" aria-live="polite">
        {status === 'saving' && <Loader2 className="size-3.5 animate-spin text-ink-400" aria-label="Guardando" />}
        {status === 'saved' && <Check className="size-3.5 text-emerald-600" aria-label="Guardado" />}
        {status === 'error' && <AlertCircle className="size-3.5 text-brand-600" aria-label={error} />}
      </span>
    </div>
  );
}
