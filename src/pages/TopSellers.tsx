// «Más vendidos»: ranking de productos por período y categoría, con la comparación
// contra el período anterior y los que menos salen (para decidir qué sacar del menú).
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown, Minus, Download, Send, Sparkles, Snail } from 'lucide-react';
import { useApi, useApp } from '../lib/app';
import type { PeriodReport, Product } from '../lib/types';
import { PageHeader, Loading, ErrorBox, EmptyState, Segmented, cx } from '../components/ui';
import { addDays, longDate, monthEnd, monthName, prevMonthStart, shortDateDow } from '../../shared/dates.ts';
import { formatNumber } from '../../shared/units.ts';

type Period = 'dia' | 'semana' | 'mes';

const PREV_LABEL: Record<Period, string> = { dia: 'ayer', semana: 'la semana pasada', mes: 'el mes pasado' };
// Si el período va en curso se compara contra los mismos días del anterior.
const PREV_LABEL_PARTIAL: Record<Period, string> = { dia: 'ayer', semana: 'los mismos días de la semana pasada', mes: 'los mismos días del mes pasado' };

function shift(period: Period, date: string, dir: 1 | -1): string {
  if (period === 'dia') return addDays(date, dir);
  if (period === 'semana') return addDays(date, 7 * dir);
  return dir === -1 ? prevMonthStart(date) : addDays(monthEnd(date), 1);
}

function periodTitle(r: PeriodReport) {
  if (r.period === 'dia') return longDate(r.range.from);
  if (r.period === 'semana') return `Semana del ${shortDateDow(r.range.from)} al ${shortDateDow(r.range.to)}`;
  return monthName(r.range.from).replace(/^./, (c) => c.toUpperCase());
}

interface Row {
  product_id: number;
  name: string;
  category: string;
  units: number;
  prev: number;
  share: number;
}

export default function TopSellers() {
  const { session } = useApp();
  const [period, setPeriod] = useState<Period>('semana');
  const [date, setDate] = useState(session.today);
  const [category, setCategory] = useState('');
  const rep = useApi<PeriodReport>(`/reports?period=${period}&date=${date}`, [period, date]);
  const products = useApi<Product[]>('/products');
  const next = shift(period, date, 1);

  const { rows, categories, total, slow } = useMemo(() => {
    const r = rep.data;
    const catalog = products.data ?? [];
    const catOf = new Map(catalog.map((p) => [p.id, p.category]));
    const prevOf = new Map((r?.prevByProduct ?? []).map((p) => [p.product_id, p.units]));
    const all: Row[] = (r?.byProduct ?? []).map((p) => ({
      product_id: p.product_id,
      name: p.name,
      category: catOf.get(p.product_id) ?? 'Otros',
      units: p.units,
      prev: prevOf.get(p.product_id) ?? 0,
      share: 0,
    }));
    // Los productos activos que no se vendieron también cuentan: son los «menos vendidos».
    for (const p of catalog) {
      if (p.active && !all.some((x) => x.product_id === p.id)) {
        all.push({ product_id: p.id, name: p.name, category: p.category, units: 0, prev: prevOf.get(p.id) ?? 0, share: 0 });
      }
    }
    const cats = [...new Set(all.map((x) => x.category))].sort((a, b) => a.localeCompare(b, 'es'));
    const filtered = all.filter((x) => !category || x.category === category);
    const sum = filtered.reduce((s, x) => s + x.units, 0);
    for (const x of filtered) x.share = sum ? (x.units / sum) * 100 : 0;
    filtered.sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, 'es'));
    const sold = filtered.filter((x) => x.units > 0);
    // Menos vendidos: los 5 de abajo (incluye los que no se vendieron), solo si hay suficientes productos.
    const bottom = filtered.length > 6 ? [...filtered].reverse().slice(0, 5) : [];
    return { rows: sold, categories: cats, total: sum, slow: bottom };
  }, [rep.data, products.data, category]);

  const r = rep.data;
  const prevLabel = r && r.range.to > session.today ? PREV_LABEL_PARTIAL[period] : PREV_LABEL[period];

  const csv = () => {
    if (!r) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ['Pizza Diana - Más vendidos', periodTitle(r), category || 'Todas las categorías'],
      [],
      ['Puesto', 'Producto', 'Categoría', 'Unidades', 'Participación %', `Unidades ${prevLabel}`],
      ...rows.map((x, i) => [i + 1, x.name, x.category, x.units, x.share.toFixed(1).replace('.', ','), x.prev]),
    ];
    const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pizza-diana-mas-vendidos-${r.period}-${r.range.from}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const whatsappText = r
    ? [`*Más vendidos · Pizza Diana*`, periodTitle(r) + (category ? ` · ${category}` : ''), '', ...rows.slice(0, 10).map((x, i) => `${i + 1}. ${x.name}: ${x.units} und`)].join('\n')
    : '';

  return (
    <>
      <PageHeader
        title="Más vendidos"
        subtitle="Qué productos se venden más, cuánto pesa cada uno en las ventas y cómo van frente al período anterior."
        actions={
          r &&
          rows.length > 0 && (
            <>
              <button className="btn-secondary" onClick={csv}>
                <Download className="size-4" /> Excel
              </button>
              <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noreferrer">
                <Send className="size-4" /> WhatsApp
              </a>
            </>
          )
        }
      />

      <div className="card mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'dia', label: 'Día' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
          ]}
        />
        <div className="flex items-center gap-2">
          <button className="btn-secondary p-2.5" onClick={() => setDate(shift(period, date, -1))} aria-label="Período anterior">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-0 flex-1 text-center text-sm font-semibold text-ink-900 lg:min-w-56">{r ? periodTitle(r) : '…'}</span>
          <button
            className="btn-secondary p-2.5"
            onClick={() => setDate(next > session.today ? session.today : next)}
            disabled={next > session.today && date === session.today}
            aria-label="Período siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
          {date !== session.today && (
            <button className="btn-ghost btn-sm" onClick={() => setDate(session.today)}>
              Hoy
            </button>
          )}
        </div>
      </div>

      {categories.length > 1 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {['', ...categories].map((c) => (
            <button
              key={c || 'todas'}
              onClick={() => setCategory(c)}
              className={cx('chip shrink-0', category === c ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400')}
            >
              {c || 'Todas'}
            </button>
          ))}
        </div>
      )}

      {rep.error ? (
        <ErrorBox message={rep.error} onRetry={rep.reload} />
      ) : !r || !products.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Trophy} title="Sin ventas en este período" text="Elige otro día, semana o mes, u otra categoría." />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {rows.slice(0, 3).map((x, i) => (
              <article
                key={x.product_id}
                className={cx(
                  'card relative overflow-hidden p-5',
                  i === 0 && 'border-crust-300 bg-gradient-to-br from-crust-300/25 to-white sm:order-2 sm:-translate-y-2',
                  i === 1 && 'sm:order-1',
                  i === 2 && 'sm:order-3',
                )}
              >
                <span
                  className={cx(
                    'grid size-10 place-items-center rounded-full font-display text-lg font-bold',
                    i === 0 ? 'bg-crust-500 text-white' : i === 1 ? 'bg-ink-400 text-white' : 'bg-brand-300 text-white',
                  )}
                >
                  {i + 1}
                </span>
                <p className="mt-3 font-display text-xl leading-tight font-semibold text-ink-900">{x.name}</p>
                <p className="text-xs text-ink-500">{x.category}</p>
                <p className="mt-3 font-display text-4xl font-semibold text-ink-900 tabular-nums">{formatNumber(x.units)}</p>
                <p className="text-xs text-ink-500">
                  unidades · {formatNumber(Math.round(x.share))} % de lo vendido{category ? ` en ${category.toLowerCase()}` : ''}
                </p>
                <div className="mt-2">
                  <Trend now={x.units} prev={x.prev} label={prevLabel} />
                </div>
              </article>
            ))}
          </div>

          <section className="card mt-6 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-cream-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Trophy className="size-5 text-crust-500" /> Ranking completo
              </h2>
              <p className="text-sm text-ink-500">
                <b className="text-ink-900">{formatNumber(total)}</b> unidades vendidas
              </p>
            </div>
            <ol className="divide-y divide-cream-200">
              {rows.map((x, i) => (
                <li key={x.product_id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-7 shrink-0 text-right font-display text-lg font-semibold text-ink-400 tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold text-ink-900">
                        {x.name} <span className="text-xs font-normal text-ink-500">· {x.category}</span>
                      </p>
                      <p className="shrink-0 font-semibold tabular-nums">
                        {formatNumber(x.units)} <span className="text-xs font-normal text-ink-500">und</span>
                      </p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${(x.units / rows[0].units) * 100}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs text-ink-500 tabular-nums">{formatNumber(Math.round(x.share * 10) / 10)} %</span>
                      <span className="hidden w-40 shrink-0 sm:block">
                        <Trend now={x.units} prev={x.prev} label={prevLabel} compact />
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {slow.length > 0 && (
            <section className="card mt-6 p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Snail className="size-5 text-ink-500" /> Los que menos se venden
              </h2>
              <p className="mb-3 text-xs text-ink-500">Sirve para decidir qué promocionar o qué sacar del menú.</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {slow.map((x) => (
                  <li key={x.product_id} className="rounded-2xl bg-cream-100 p-3">
                    <p className="truncate text-sm font-semibold text-ink-900">{x.name}</p>
                    <p className="text-xs text-ink-500">{x.category}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{x.units === 0 ? 'No se vendió' : `${formatNumber(x.units)} und`}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Trend({ now, prev, label, compact }: { now: number; prev: number; label: string; compact?: boolean }) {
  if (prev === 0) {
    if (now === 0) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
        <Sparkles className="size-3.5" /> {compact ? 'Nuevo' : `No se vendió en ${label}`}
      </span>
    );
  }
  const diff = now - prev;
  const pct = Math.round((diff / prev) * 100);
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-brand-700' : 'text-ink-500')}>
      <Icon className="size-3.5" />
      {diff > 0 ? '+' : ''}
      {pct} %{compact ? ` (${formatNumber(prev)})` : ` frente a ${label} (${formatNumber(prev)})`}
    </span>
  );
}
