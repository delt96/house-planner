import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { createApp } from '../../server/app.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export function createTestApp() {
  const db = newDb();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    db.public.none(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const app = createApp(pool);
  return { app, pool };
}
