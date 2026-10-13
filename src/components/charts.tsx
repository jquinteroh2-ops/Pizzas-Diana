// Gráficos compartidos por el tablero y los reportes. Todos leen datos reales de la API.
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shortDate, shortDateDow } from '../../shared/dates.ts';
import { formatNumber } from '../../shared/units.ts';
import type { ProductUnits } from '../lib/types';

export const BRAND = '#c42d1a';
const GRID = '#efe7da';
const AXIS = '#7a6c64';
// Paleta categórica validada (separación para daltonismo), en orden fijo.
const CATEGORICAL = ['#d6402f', '#2a78d6', '#e0a100', '#1baf7a', '#9b59b6', '#e87ba4'];
const OTHER = '#b5aca4';

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-cream-300 bg-white px-3.5 py-2.5 text-sm shadow-pop">
      <p className="mb-1 font-semibold text-ink-900">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-700">
          {r.color && <span className="size-2.5 rounded-full" style={{ background: r.color }} />}
          <span className="text-ink-500">{r.label}:</span> <span className="font-semibold text-ink-900">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const unitsText = (n: number) => `${formatNumber(n)} ${n === 1 ? 'unidad' : 'unidades'}`;

/** Unidades vendidas por día (área con línea de 2px). */
export function UnitsLine({ data, height = 280 }: { data: { date: string; units: number }[]; height?: number }) {
  const dense = data.length > 14;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="unitsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => (dense ? shortDate(d) : shortDateDow(d))}
          tick={{ fill: AXIS, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          minTickGap={dense ? 24 : 8}
        />
        <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={shortDateDow(String(payload[0].payload.date))}
                rows={[{ label: 'Vendidas', value: unitsText(Number(payload[0].value)), color: BRAND }]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="units"
          stroke={BRAND}
          strokeWidth={2}
          fill="url(#unitsFill)"
          dot={dense ? false : { r: 4, fill: '#fff', stroke: BRAND, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: BRAND, stroke: '#fff', strokeWidth: 2 }}
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barras verticales para evoluciones con etiquetas propias (semanas de un mes, etc.). */
export function UnitsColumns({ data, height = 260 }: { data: { label: string; tooltip: string; units: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(196,45,26,0.06)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={String(payload[0].payload.tooltip)} rows={[{ label: 'Vendidas', value: unitsText(Number(payload[0].value)), color: BRAND }]} />
            ) : null
          }
        />
        <Bar dataKey="units" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={56} animationDuration={500}>
          <LabelList dataKey="units" position="top" className="fill-ink-700 text-xs font-semibold" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranking de productos más vendidos (barras horizontales). */
export function TopProductsBars({ data, max = 8 }: { data: ProductUnits[]; max?: number }) {
  const rows = data.slice(0, max);
  const height = Math.max(160, rows.length * 44 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap={10}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fill: '#4a3d36', fontSize: 12.5, fontWeight: 500 }}
          tickFormatter={(s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(196,45,26,0.06)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={String(payload[0].payload.name)} rows={[{ label: 'Vendidas', value: unitsText(Number(payload[0].value)), color: BRAND }]} />
            ) : null
          }
        />
        <Bar dataKey="units" fill={BRAND} radius={[0, 4, 4, 0]} animationDuration={500}>
          <LabelList dataKey="units" position="right" className="fill-ink-700 text-xs font-semibold" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Participación de cada producto. Muestra los 5 principales y agrupa el resto en "Otros".
 * El color sigue al producto (por su id), no a su posición en el ranking.
 */
export function ShareDonut({ data, top = 5 }: { data: ProductUnits[]; top?: number }) {
  const slices = useMemo(() => {
    const total = data.reduce((s, d) => s + d.units, 0);
    const main = data.slice(0, data.length > top + 1 ? top : data.length);
    const rest = data.slice(main.length);
    const used = new Set<number>();
    const out = main.map((d) => {
      let idx = d.product_id % CATEGORICAL.length;
      while (used.has(idx) && used.size < CATEGORICAL.length) idx = (idx + 1) % CATEGORICAL.length;
      used.add(idx);
      return { name: d.name, units: d.units, color: CATEGORICAL[idx], pct: total ? d.units / total : 0 };
    });
    if (rest.length) {
      const u = rest.reduce((s, d) => s + d.units, 0);
      out.push({ name: `Otros (${rest.length})`, units: u, color: OTHER, pct: total ? u / total : 0 });
    }
    return { out, total };
  }, [data, top]);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices.out} dataKey="units" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1.5} stroke="#fff" strokeWidth={2} animationDuration={500}>
              {slices.out.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(payload[0].name)}
                    rows={[
                      { label: 'Vendidas', value: unitsText(Number(payload[0].value)), color: String(payload[0].payload.color) },
                      { label: 'Participación', value: `${Math.round(Number(payload[0].payload.pct) * 100)} %` },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-3xl font-semibold text-ink-900">{formatNumber(slices.total)}</p>
            <p className="text-xs text-ink-500">unidades</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {slices.out.map((s) => (
          <li key={s.name} className="flex items-center gap-2.5 text-sm">
            <span className="size-3 shrink-0 rounded-[4px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-700">{s.name}</span>
            <span className="font-semibold text-ink-900 tabular-nums">{formatNumber(s.units)}</span>
            <span className="w-11 text-right text-xs text-ink-500 tabular-nums">{Math.round(s.pct * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
