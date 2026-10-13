// Punto de entrada del servidor: node server/index.ts
import { resolve } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = resolve(process.env.DB_PATH ?? 'data/pizza-diana.db');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const db = openDb(DB_PATH);
const app = createApp(db, {
  secureCookies: production && process.env.INSECURE_COOKIES !== '1',
  staticDir: resolve('dist'),
});
if (production) app.set('trust proxy', 1);

app.listen(PORT, () => {
  console.log(`Pizza Diana · servidor en http://localhost:${PORT}  (base de datos: ${DB_PATH})`);
});
