import { test, expect } from 'vitest';
import { normalizeRoomFeature } from '../server/validation.js';

const ROOM = { width_cm: 400, depth_cm: 300 };

test('accepts a valid door and nulls irrelevant fields', () => {
  const { errors, value } = normalizeRoomFeature(
    { kind: 'door', wall: 'S', offset_cm: 30, width_cm: 80, height_cm: 204, swing: 'in-left', floor_height_cm: 30 },
    ROOM
  );
  expect(errors).toEqual([]);
  expect(value).toMatchObject({ kind: 'door', wall: 'S', offset_cm: 30, width_cm: 80, height_cm: 204, swing: 'in-left' });
  expect(value.floor_height_cm).toBeNull(); // 문에는 무관한 필드 → null
  expect(value.sill_height_cm).toBeNull();
});

test('rejects an unknown kind and wall', () => {
  const { errors } = normalizeRoomFeature({ kind: 'desk', wall: 'X', offset_cm: 0 }, ROOM);
  expect(errors.join(' ')).toMatch(/kind/);
  expect(errors.join(' ')).toMatch(/wall/);
});

test('door and window require a width', () => {
  const { errors } = normalizeRoomFeature({ kind: 'window', wall: 'N', offset_cm: 10 }, ROOM);
  expect(errors.join(' ')).toMatch(/폭/);
});

test('offset is required — empty string is not silently 0', () => {
  const { errors } = normalizeRoomFeature({ kind: 'outlet', wall: 'E', offset_cm: '' }, ROOM);
  expect(errors.join(' ')).toMatch(/offset_cm/);
});

test('outlet needs no width and drops one if sent', () => {
  const { errors, value } = normalizeRoomFeature(
    { kind: 'outlet', wall: 'E', offset_cm: 150, floor_height_cm: 30, width_cm: 50 },
    ROOM
  );
  expect(errors).toEqual([]);
  expect(value.width_cm).toBeNull();
  expect(value.floor_height_cm).toBe(30);
});

test('rejects a feature extending past the wall — N/S walls use width_cm', () => {
  // S벽 길이 = room.width_cm = 400
  const ok = normalizeRoomFeature({ kind: 'window', wall: 'S', offset_cm: 320, width_cm: 80 }, ROOM);
  expect(ok.errors).toEqual([]);
  const bad = normalizeRoomFeature({ kind: 'window', wall: 'S', offset_cm: 321, width_cm: 80 }, ROOM);
  expect(bad.errors.join(' ')).toMatch(/벽 길이/);
});

test('E/W walls use depth_cm as the wall length', () => {
  const bad = normalizeRoomFeature({ kind: 'outlet', wall: 'E', offset_cm: 301 }, ROOM);
  expect(bad.errors.join(' ')).toMatch(/벽 길이/);
});

test('rejects a negative offset and an unknown swing', () => {
  const { errors } = normalizeRoomFeature(
    { kind: 'door', wall: 'N', offset_cm: -1, width_cm: 80, swing: 'sideways' },
    ROOM
  );
  expect(errors.join(' ')).toMatch(/offset_cm/);
  expect(errors.join(' ')).toMatch(/swing/);
});
