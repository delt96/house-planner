import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Tables each migration creates — used only to back-fill schema_migrations for a
// pre-existing database that was set up before migration tracking existed.
const MIGRATION_TABLES = {
  '001_init.sql': ['items', 'candidates'],
  '002_rooms_placements.sql': ['rooms', 'placements'],
};

async function publicTables(pool) {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  return new Set(rows.map((r) => r.table_name));
}

export async function runMigrations(pool, dir = defaultDir) {
  // Create the tracking table if it doesn't exist. (No CREATE TABLE IF NOT EXISTS:
  // pg-mem can't parse it — check information_schema instead.)
  if (!(await publicTables(pool)).has('schema_migrations')) {
    await pool.query(
      'CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows: appliedRows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.filename));

  // Back-fill: a database created before tracking existed already has some tables but
  // no schema_migrations rows. Mark migrations whose tables all already exist as applied,
  // so their non-idempotent CREATE TABLEs are not re-run.
  if (applied.size === 0) {
    const existing = await publicTables(pool);
    for (const f of files) {
      const owned = MIGRATION_TABLES[f];
      if (owned && owned.every((t) => existing.has(t))) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
        applied.add(f);
        console.log('Back-fill (already present)', f);
      }
    }
  }

  for (const f of files) {
    if (applied.has(f)) {
      console.log('Skip (already applied)', f);
      continue;
    }
    console.log('Running', f);
    await pool.query(readFileSync(path.join(dir, f), 'utf8'));
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
  }
  console.log('Migrations complete');
}
