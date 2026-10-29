// Una casilla de la hoja de papel: se escribe libre, como a mano («3 paq + 385», «542 grs»),
// y se guarda sola al salir de la casilla o con Enter (que baja a la siguiente, como en la hoja).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cx } from '../ui';
import { parseSheetText, qtyText, type Measure } from './qty';

type Status = 'idle' | 'saving' | 'saved' | 'error';

function moveFocus(from: HTMLElement, col: string, step: 1 | -1) {
  const all = [...document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)].filter((el) => el.offsetParent !== null);
  const next = all[all.indexOf(from as HTMLInputElement) + step];
  if (next) {
    next.focus();
    next.select();
  }
}

export function PaperCell({
  value,
  measure,
  col,
  label,
  onSave,
}: {
  value: number | null;
  measure: Measure;
  col: string;
  label: string;
  onSave: (milli: number | null) => Promise<void>;
}) {
  const shown = qtyText(value, measure);
  const [text, setText] = useState(shown);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const editing = useRef(false);
  const dirty = useRef(false);

  // Si el dato cambia desde afuera, se muestra (salvo que se esté escribiendo).
  useEffect(() => {
    if (!editing.current) setText(shown);
  }, [shown]);

  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(() => setStatus('idle'), 1500);
    return () => clearTimeout(t);
  }, [status]);

  const commit = async () => {
    editing.current = false;
    if (!dirty.current) return;
    const milli = parseSheetText(text, measure);
    if (Number.isNaN(milli)) {
      setStatus('error');
      setError('No se entiende. Escriba como en la hoja: 3 paq + 385, 542 grs, 2 und.');
      return;
    }
    if (milli === value) {
      dirty.current = false;
      setText(shown);
      setStatus('idle');
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

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const el = e.currentTarget;
      moveFocus(el, col, e.key === 'ArrowUp' ? -1 : 1);
      if (document.activeElement === el) el.blur();
    } else if (e.key === 'Escape') {
      dirty.current = false;
      setText(shown);
      setStatus('idle');
      e.currentTarget.blur();
    }
  };

  return (
    <div className="relative" title={status === 'error' ? error : undefined}>
      <input
        data-col={col}
        className={cx(
          'h-9 w-full min-w-24 bg-transparent px-1.5 text-center text-[15px] font-semibold text-[#1f3f8f] tabular-nums outline-none placeholder:text-transparent',
          'focus:bg-amber-50 focus:ring-2 focus:ring-ink-900 focus:ring-inset',
          status === 'error' && 'bg-brand-50 ring-2 ring-brand-600 ring-inset',
        )}
        value={text}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="next"
        onFocus={(e) => {
          editing.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => void commit()}
        onKeyDown={onKey}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
          if (status === 'error') setStatus('idle');
        }}
      />
      <span className="pointer-events-none absolute top-0.5 right-0.5" aria-live="polite">
        {status === 'saving' && <Loader2 className="size-3 animate-spin text-ink-400" aria-label="Guardando" />}
        {status === 'saved' && <Check className="size-3 text-emerald-600" aria-label="Guardado" />}
        {status === 'error' && <AlertCircle className="size-3 text-brand-600" aria-label={error} />}
      </span>
      {status === 'error' && <p className="px-1 pb-1 text-left text-[10px] leading-tight text-brand-700">{error}</p>}
    </div>
  );
}
