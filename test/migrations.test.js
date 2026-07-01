import { test, expect } from 'vitest';
import { createTestApp } from './helpers/testApp.js';

test('phase 2 tables exist and are empty', async () => {
  const { pool } = createTestApp();
  const rooms = await pool.query('SELECT * FROM rooms');
  const placements = await pool.query('SELECT * FROM placements');
  expect(rooms.rows).toEqual([]);
  expect(placements.rows).toEqual([]);
});
