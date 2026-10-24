// Punto de entrada del servidor: node server/index.ts
// Base de datos: si existe DATABASE_URL (Neon en Render) se usa esa; si no, PGlite en data/pglite.
import { resolve } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_TARGET = process.env.DATABASE_URL || resolve(process.env.DB_PATH ?? 'data/pglite');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const db = await openDb(DB_TARGET);
const app = createApp(db, {
  secureCookies: production && process.env.INSECURE_COOKIES !== '1',
  staticDir: resolve('dist'),
});
if (production) app.set('trust proxy', 1);

const server = app.listen(PORT, () => {
  // Nunca se imprime la dirección de Neon: lleva la contraseña.
  console.log(`Pizza Diana · servidor en http://localhost:${PORT}  (base de datos: ${process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : DB_TARGET})`);
});

// Render apaga el servicio con SIGTERM: se cierran las conexiones con calma.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close();
    void db.close().finally(() => process.exit(0));
  });
}
