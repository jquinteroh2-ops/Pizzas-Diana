// Fechas de negocio. Todo se calcula en la hora de Colombia (America/Bogota)
// para que "hoy" sea el mismo día del restaurante aunque el servidor esté en otro país.
// La semana del sistema va de LUNES a DOMINGO.

export const TIME_ZONE = 'America/Bogota';

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha local (YYYY-MM-DD) de un instante. */
export function localDate(d: Date | string = new Date()): string {
  return ymdFmt.format(typeof d === 'string' ? new Date(d) : d);
}

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

function toUtc(ymd: string): Date {
  return new Date(ymd + 'T00:00:00Z');
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Lunes de la semana que contiene la fecha. */
export function weekStart(ymd: string): string {
  const dow = toUtc(ymd).getUTCDay(); // 0 = domingo
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function weekEnd(ymd: string): string {
  return addDays(weekStart(ymd), 6);
}

export function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + '01';
}

export function monthEnd(ymd: string): string {
  const d = toUtc(monthStart(ymd));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUtc(d);
}

export function prevMonthStart(ymd: string): string {
  return monthStart(addDays(monthStart(ymd), -1));
}

/** Lista de fechas entre from y to, ambas incluidas. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "13 oct" */
export function shortDate(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}

/** "lun 13 oct" */
export function shortDateDow(ymd: string): string {
  return `${DOW[toUtc(ymd).getUTCDay()]} ${shortDate(ymd)}`;
}

/** "13 de octubre de 2026" */
export function longDate(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} de ${MONTHS_LONG[Number(ymd.slice(5, 7)) - 1]} de ${ymd.slice(0, 4)}`;
}

export function monthName(ymd: string): string {
  return `${MONTHS_LONG[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

const dtFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  return dtFmt.format(new Date(iso));
}

const timeFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
