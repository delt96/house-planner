import 'dotenv/config';
import { createPool } from './db.js';
import { runMigrations } from './migrations-runner.js';

const pool = createPool();
try {
  await runMigrations(pool);
} finally {
  await pool.end();
}
